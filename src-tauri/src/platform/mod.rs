//! Platform-specific code for MPV window embedding.

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "macos")]
pub use macos::*;

/// Get the native view pointer from a Tauri window.
/// On macOS: returns the NSView pointer.
/// On Windows: returns the HWND.
pub fn get_native_view(window: &tauri::WebviewWindow) -> Result<*mut std::ffi::c_void, String> {
    use raw_window_handle::HasWindowHandle;

    let handle = window.window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;

    match handle.as_raw() {
        #[cfg(target_os = "macos")]
        raw_window_handle::RawWindowHandle::AppKit(raw) => {
            Ok(raw.ns_view.as_ptr() as *mut std::ffi::c_void)
        }
        #[cfg(target_os = "windows")]
        raw_window_handle::RawWindowHandle::Win32(raw) => {
            Ok(raw.hwnd.get() as *mut std::ffi::c_void)
        }
        _ => Err("Unsupported platform".into()),
    }
}
