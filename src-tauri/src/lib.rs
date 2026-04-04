use tauri::Manager;
use std::sync::{Arc, OnceLock};
use std::ffi::c_void;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};

mod mpv;
mod platform;

use mpv::handle::MpvHandle;

/// Global MPV instance (initialized lazily on first load_file).
static MPV_INSTANCE: OnceLock<Arc<MpvHandle>> = OnceLock::new();

/// Kept alive so the dylib stays loaded for the process lifetime.
static SOIA_UTILS_LIB: OnceLock<libloading::Library> = OnceLock::new();

/// Stop flag for the render loop thread.
static RENDER_LOOP_STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Find the libmpv library path.
/// Checks: bundled libs dir (relative to executable), homebrew, system paths.
fn find_libmpv() -> Option<String> {
    // Resolve paths relative to the executable so they work regardless of CWD.
    // In dev: src-tauri/target/debug/<exe> → src-tauri/libs/mpv/
    // In prod: <app bundle>/Contents/MacOS/<exe> → alongside or in Frameworks/
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut candidates: Vec<String> = Vec::new();

    if let Some(ref dir) = exe_dir {
        if cfg!(target_os = "macos") {
            // Dev build: exe is at src-tauri/target/debug/ → go up to src-tauri/libs/mpv/
            candidates.push(dir.join("../../libs/mpv/libmpv.2.dylib").to_string_lossy().to_string());
            // Release/bundle: libs next to executable
            candidates.push(dir.join("libs/mpv/libmpv.2.dylib").to_string_lossy().to_string());
            // Frameworks dir (Tauri bundle convention)
            candidates.push(dir.join("../Frameworks/libmpv.2.dylib").to_string_lossy().to_string());
        } else if cfg!(target_os = "windows") {
            candidates.push(dir.join("libs\\mpv\\libmpv-2.dll").to_string_lossy().to_string());
            candidates.push(dir.join("libmpv-2.dll").to_string_lossy().to_string());
        } else {
            candidates.push(dir.join("libs/mpv/libmpv.so.2").to_string_lossy().to_string());
        }
    }

    // Fallback: system-installed paths
    if cfg!(target_os = "macos") {
        candidates.push("/opt/homebrew/lib/libmpv.2.dylib".to_string());
        candidates.push("/usr/local/lib/libmpv.2.dylib".to_string());
    } else if cfg!(target_os = "windows") {
        candidates.push("libmpv-2.dll".to_string());
    } else {
        candidates.push("libmpv.so.2".to_string());
        candidates.push("/usr/lib/libmpv.so.2".to_string());
    }

    for path in &candidates {
        let resolved = std::path::Path::new(path);
        if resolved.exists() {
            // Return canonical path so libloading gets the real location
            if let Ok(canon) = resolved.canonicalize() {
                return Some(canon.to_string_lossy().to_string());
            }
            return Some(path.clone());
        }
    }
    None
}

/// Pre-load a dylib with RTLD_GLOBAL so its symbols are visible to all other loaded libraries.
unsafe fn preload_global(path: &std::path::Path) {
    if !path.exists() { return; }
    let path_cstr = match std::ffi::CString::new(path.to_string_lossy().as_bytes()) {
        Ok(c) => c,
        Err(_) => return,
    };
    log::info!("Pre-loading (RTLD_GLOBAL): {}", path.display());
    let handle = libc::dlopen(path_cstr.as_ptr(), libc::RTLD_NOW | libc::RTLD_GLOBAL);
    if handle.is_null() {
        let err = libc::dlerror();
        let msg = if err.is_null() { "unknown".to_string() }
                  else { std::ffi::CStr::from_ptr(err).to_string_lossy().to_string() };
        log::warn!("  dlopen failed: {}", msg);
    }
}

/// Get the NSView pointer from the Tauri main window.
fn get_ns_view(app_handle: &tauri::AppHandle) -> Result<*const c_void, String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Failed to get main window")?;
    let handle = window.window_handle()
        .map_err(|e| format!("window_handle error: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::AppKit(raw) => Ok(raw.ns_view.as_ptr() as *const c_void),
        other => Err(format!("Unsupported window handle: {:?}", other)),
    }
}

/// Initialize MPV if not already done.
fn ensure_mpv(app_handle: &tauri::AppHandle) -> Result<Arc<MpvHandle>, String> {
    if let Some(mpv) = MPV_INSTANCE.get() {
        return Ok(mpv.clone());
    }

    // Set locale for libmpv (required — breaks float parsing otherwise)
    unsafe { libc::setlocale(libc::LC_NUMERIC, b"C\0".as_ptr() as *const i8); }

    let lib_path = find_libmpv()
        .ok_or_else(|| "libmpv not found. Run: scripts/setup_mpv_libs.sh".to_string())?;
    let lib_dir = std::path::Path::new(&lib_path).parent()
        .ok_or("Cannot determine libmpv directory")?;

    log::info!("Loading libmpv from: {}", lib_path);

    // Point the Vulkan loader at the bundled MoltenVK ICD manifest.
    // Without this, VK_KHR_surface and VK_EXT_metal_surface are missing
    // and soia_utils falls back to render context mode.
    let icd_path = lib_dir.join("MoltenVK_icd.json");
    if icd_path.exists() {
        std::env::set_var("VK_ICD_FILENAMES", &icd_path);
        std::env::set_var("VK_DRIVER_FILES", &icd_path);
        log::info!("Set VK_ICD_FILENAMES={}", icd_path.display());
    }

    // Pre-load libsoia_utils and libmpv with RTLD_GLOBAL.
    // soia_utils provides _ra_ctx_vulkan_soia needed by this libmpv build.
    // libmpv must be global so soia_utils_create can find mpv symbols via dlopen(NULL).
    unsafe {
        preload_global(&lib_dir.join("libsoia_utils.dylib"));
        preload_global(std::path::Path::new(&lib_path));
    }

    let fns = unsafe { mpv::ffi::MpvFunctions::load(&lib_path) }?;
    let fns = Arc::new(fns);
    let mpv = unsafe { MpvHandle::new(fns) }?;

    // Configure defaults (hwdec, cache, subtitles, HDR, yt-dlp)
    mpv::handle::configure_mpv_defaults(&mpv)?;

    // Initialize mpv (must happen before soia_utils_create, matching soia's flow)
    mpv.initialize()?;

    // Initialize soia_utils — sets up Vulkan rendering surface in the Tauri window.
    // soia_utils_create(mpv_ctx, ns_view, display, mode)
    // mode 0 = native rendering (mpv manages vo=gpu-next internally)
    let ns_view = get_ns_view(app_handle)?;
    let soia_utils_path = lib_dir.join("libsoia_utils.dylib");
    if soia_utils_path.exists() {
        let soia_lib = unsafe { libloading::Library::new(&soia_utils_path) }
            .map_err(|e| format!("Failed to load libsoia_utils: {}", e))?;

        type SoiaUtilsCreateFn = unsafe extern "C" fn(
            mpv_ctx: *mut c_void,
            window: *const c_void,
            display: *const c_void,
            mode: i32,
        ) -> *mut c_void;

        let soia_create: SoiaUtilsCreateFn = unsafe {
            let sym = soia_lib.get::<*const ()>(b"soia_utils_create\0")
                .map_err(|e| format!("Failed to load soia_utils_create: {}", e))?;
            std::mem::transmute(*sym)
        };

        let soia_ctx = unsafe {
            soia_create(mpv.ctx_ptr() as *mut c_void, ns_view, std::ptr::null(), 0)
        };
        if soia_ctx.is_null() {
            log::warn!("soia_utils_create returned null — video output may not work");
        } else {
            log::info!("soia_utils initialized — video rendering active");
            // Debug: check what vo is set after soia_utils_create
            if let Some(vo) = mpv.get_property_string("vo") {
                log::info!("MPV vo after soia_utils_create: {}", vo);
            } else {
                log::warn!("MPV vo is not set after soia_utils_create");
            }
            if let Some(gpu_api) = mpv.get_property_string("gpu-api") {
                log::info!("MPV gpu-api after soia_utils_create: {}", gpu_api);
            }

            // Check if render context mode is active (mode 2 fallback).
            // If so, start a render loop thread that drives frame updates.
            type SoiaUtilsUsesRenderCtxFn = unsafe extern "C" fn(*mut c_void) -> i32;
            type SoiaUtilsRenderCtxUpdateFn = unsafe extern "C" fn(*mut c_void);

            let uses_render_ctx: SoiaUtilsUsesRenderCtxFn = unsafe {
                std::mem::transmute(*soia_lib.get::<*const ()>(b"soia_utils_uses_render_context\0")
                    .map_err(|e| format!("Failed to load soia_utils_uses_render_context: {}", e))?)
            };
            let needs_render_loop = unsafe { uses_render_ctx(soia_ctx) != 0 };

            if needs_render_loop {
                log::info!("Render context mode — starting render loop");
                let render_update: SoiaUtilsRenderCtxUpdateFn = unsafe {
                    std::mem::transmute(*soia_lib.get::<*const ()>(b"soia_utils_render_context_update\0")
                        .map_err(|e| format!("Failed to load soia_utils_render_context_update: {}", e))?)
                };
                let ctx_addr = soia_ctx as usize;
                RENDER_LOOP_STOP.store(false, std::sync::atomic::Ordering::SeqCst);
                std::thread::spawn(move || {
                    let ptr = ctx_addr as *mut c_void;
                    while !RENDER_LOOP_STOP.load(std::sync::atomic::Ordering::Relaxed) {
                        unsafe { render_update(ptr); }
                        std::thread::sleep(std::time::Duration::from_millis(8));
                    }
                });
            }
        }

        // Keep the library loaded for the process lifetime
        let _ = SOIA_UTILS_LIB.set(soia_lib);
    }

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
        .plugin(tauri_plugin_store::Builder::new().build())
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
