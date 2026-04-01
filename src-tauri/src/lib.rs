use tauri::Manager;
use std::sync::{Arc, OnceLock};

mod mpv;
mod platform;

use mpv::handle::MpvHandle;

/// Global MPV instance (initialized lazily on first load_file).
static MPV_INSTANCE: OnceLock<Arc<MpvHandle>> = OnceLock::new();

/// Find the libmpv library path.
/// Checks: bundled libs dir, homebrew, system paths.
fn find_libmpv() -> Option<String> {
    let candidates = if cfg!(target_os = "macos") {
        vec![
            // Bundled with app
            "./libs/mpv/libmpv.2.dylib".to_string(),
            // Homebrew Apple Silicon
            "/opt/homebrew/lib/libmpv.2.dylib".to_string(),
            // Homebrew Intel
            "/usr/local/lib/libmpv.2.dylib".to_string(),
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            ".\\libs\\mpv\\libmpv-2.dll".to_string(),
            "libmpv-2.dll".to_string(),
        ]
    } else {
        vec![
            "libmpv.so.2".to_string(),
            "/usr/lib/libmpv.so.2".to_string(),
        ]
    };

    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }
    // On macOS, also try the resource dir at runtime
    None
}

/// Initialize MPV if not already done.
fn ensure_mpv(app_handle: &tauri::AppHandle) -> Result<Arc<MpvHandle>, String> {
    if let Some(mpv) = MPV_INSTANCE.get() {
        return Ok(mpv.clone());
    }

    // Set locale for libmpv (required — breaks float parsing otherwise)
    unsafe { libc::setlocale(libc::LC_NUMERIC, b"C\0".as_ptr() as *const i8); }

    let lib_path = find_libmpv()
        .ok_or_else(|| "libmpv not found. Install mpv: brew install mpv".to_string())?;

    log::info!("Loading libmpv from: {}", lib_path);

    let fns = unsafe { mpv::ffi::MpvFunctions::load(&lib_path) }?;
    let fns = Arc::new(fns);
    let mpv = unsafe { MpvHandle::new(fns) }?;

    // Configure defaults (hwdec, cache, subtitles, HDR, yt-dlp)
    mpv::handle::configure_mpv_defaults(&mpv)?;

    // Initialize mpv
    mpv.initialize()?;

    // Observe key properties for the event loop
    mpv.observe_property("pause", mpv::ffi::MPV_FORMAT_FLAG, 1)?;
    mpv.observe_property("time-pos", mpv::ffi::MPV_FORMAT_DOUBLE, 2)?;
    mpv.observe_property("duration", mpv::ffi::MPV_FORMAT_DOUBLE, 3)?;
    mpv.observe_property("paused-for-cache", mpv::ffi::MPV_FORMAT_FLAG, 4)?;
    mpv.observe_property("eof-reached", mpv::ffi::MPV_FORMAT_FLAG, 5)?;
    mpv.observe_property("track-list", mpv::ffi::MPV_FORMAT_NONE, 6)?;

    let mpv = Arc::new(mpv);

    // Start event loop on background thread
    mpv::event_loop::start_event_loop(mpv.clone(), app_handle.clone());

    let _ = MPV_INSTANCE.set(mpv.clone());
    log::info!("MPV initialized successfully");
    Ok(mpv)
}

// --- Tauri Commands ---

#[tauri::command]
fn load_file(app_handle: tauri::AppHandle, path: String, resume_pos: Option<f64>) -> Result<(), String> {
    let mpv = ensure_mpv(&app_handle)?;

    if let Some(pos) = resume_pos {
        // Load file and seek to resume position
        mpv.command(&["loadfile", &path])?;
        // Seek will happen after file is loaded via event
        mpv.set_property_string("start", &format!("{}", pos))?;
    } else {
        mpv.command(&["loadfile", &path])?;
    }
    Ok(())
}

#[tauri::command]
fn mpv_command(app_handle: tauri::AppHandle, args: Vec<String>) -> Result<serde_json::Value, String> {
    let mpv = ensure_mpv(&app_handle)?;
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    mpv.command(&arg_refs)?;
    Ok(serde_json::json!(null))
}

#[tauri::command]
fn mpv_set_property(app_handle: tauri::AppHandle, name: String, value: String) -> Result<(), String> {
    let mpv = ensure_mpv(&app_handle)?;
    mpv.set_property_string(&name, &value)
}

#[tauri::command]
fn mpv_get_property(app_handle: tauri::AppHandle, name: String) -> Result<serde_json::Value, String> {
    let mpv = ensure_mpv(&app_handle)?;

    // Try string first
    if let Some(val) = mpv.get_property_string(&name) {
        return Ok(serde_json::Value::String(val));
    }
    // Try double
    if let Some(val) = mpv.get_property_double(&name) {
        return Ok(serde_json::json!(val));
    }
    Ok(serde_json::Value::Null)
}

#[tauri::command]
fn cycle_pause(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mpv = ensure_mpv(&app_handle)?;
    mpv.command(&["cycle", "pause"])
}

#[tauri::command]
fn seek_video(app_handle: tauri::AppHandle, position: f64) -> Result<(), String> {
    let mpv = ensure_mpv(&app_handle)?;
    mpv.command(&["seek", &position.to_string(), "absolute"])
}

#[tauri::command]
fn mpv_available() -> bool {
    find_libmpv().is_some()
}

// --- App Entry ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_file,
            mpv_command,
            mpv_set_property,
            mpv_get_property,
            cycle_pause,
            seek_video,
            mpv_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
