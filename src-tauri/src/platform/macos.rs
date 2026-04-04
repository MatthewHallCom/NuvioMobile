//! macOS-specific platform code.
//! Following soia's pattern: extract NSView, manage CAMetalLayer geometry.

/// Sync the MPV render layer geometry after a window resize.
/// On macOS, CAMetalLayer sublayers don't auto-resize with the parent view.
/// Must be called on every Resized event.
///
/// NOTE: This will be expanded when the native helper library (libnuvio_mpv)
/// is implemented. For now it's a placeholder.
pub fn sync_layer_geometry(_ns_view: *mut std::ffi::c_void, _width: u32, _height: u32) {
    // TODO: Call into libnuvio_mpv to resize the CAMetalLayer
    // nuvio_mpv_resize(width, height)
}

/// On macOS, the render target uses physical pixels (not logical).
/// This prevents blurry video on Retina displays.
pub fn physical_size(logical_width: u32, logical_height: u32, scale_factor: f64) -> (u32, u32) {
    (
        (logical_width as f64 * scale_factor) as u32,
        (logical_height as f64 * scale_factor) as u32,
    )
}
