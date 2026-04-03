//! MpvHandle — owns the mpv context, manages lifecycle and property access.

use std::ffi::{CStr, CString};
use std::sync::Arc;

use super::ffi::*;

/// Thread-safe wrapper around an mpv instance.
pub struct MpvHandle {
    ctx: *mut mpv_handle,
    fns: Arc<MpvFunctions>,
}

// mpv_handle is thread-safe when using its API correctly
unsafe impl Send for MpvHandle {}
unsafe impl Sync for MpvHandle {}

impl MpvHandle {
    /// Create a new mpv instance with the given libmpv functions.
    /// IMPORTANT: Call libc::setlocale(LC_NUMERIC, "C") before this.
    pub unsafe fn new(fns: Arc<MpvFunctions>) -> Result<Self, String> {
        let ctx = (fns.create)();
        if ctx.is_null() {
            return Err("mpv_create returned null".into());
        }
        Ok(Self { ctx, fns })
    }

    /// Set an option before mpv_initialize.
    pub fn set_option(&self, name: &str, value: &str) -> Result<(), String> {
        let name_c = CString::new(name).unwrap();
        let value_c = CString::new(value).unwrap();
        let ret = unsafe { (self.fns.set_option_string)(self.ctx, name_c.as_ptr(), value_c.as_ptr()) };
        if ret < 0 {
            Err(format!("mpv_set_option_string({}, {}) failed: {}", name, value, ret))
        } else {
            Ok(())
        }
    }

    /// Initialize mpv (call after setting options).
    pub fn initialize(&self) -> Result<(), String> {
        let ret = unsafe { (self.fns.initialize)(self.ctx) };
        if ret < 0 {
            Err(format!("mpv_initialize failed: {}", ret))
        } else {
            Ok(())
        }
    }

    /// Set a property as a string.
    pub fn set_property_string(&self, name: &str, value: &str) -> Result<(), String> {
        let name_c = CString::new(name).unwrap();
        let value_c = CString::new(value).unwrap();
        let ret = unsafe { (self.fns.set_property_string)(self.ctx, name_c.as_ptr(), value_c.as_ptr()) };
        if ret < 0 {
            Err(format!("set_property({}, {}) failed: {}", name, value, ret))
        } else {
            Ok(())
        }
    }

    /// Get a property as a string. Returns None if the property doesn't exist.
    pub fn get_property_string(&self, name: &str) -> Option<String> {
        let name_c = CString::new(name).unwrap();
        let ptr = unsafe { (self.fns.get_property_string)(self.ctx, name_c.as_ptr()) };
        if ptr.is_null() {
            return None;
        }
        let value = unsafe { CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        unsafe { (self.fns.free)(ptr as *mut _) };
        Some(value)
    }

    /// Get a property as a double via mpv_get_property with MPV_FORMAT_DOUBLE.
    pub fn get_property_double(&self, name: &str) -> Option<f64> {
        let name_c = CString::new(name).unwrap();
        let mut value: f64 = 0.0;
        let ret = unsafe {
            (self.fns.get_property)(
                self.ctx,
                name_c.as_ptr(),
                MPV_FORMAT_DOUBLE,
                &mut value as *mut f64 as *mut std::ffi::c_void,
            )
        };
        if ret < 0 { None } else { Some(value) }
    }

    /// Send a command with arguments array.
    pub fn command(&self, args: &[&str]) -> Result<(), String> {
        let c_args: Vec<CString> = args.iter().map(|s| CString::new(*s).unwrap()).collect();
        let mut ptrs: Vec<*const i8> = c_args.iter().map(|s| s.as_ptr()).collect();
        ptrs.push(std::ptr::null()); // null-terminated array

        let ret = unsafe { (self.fns.command)(self.ctx, ptrs.as_mut_ptr()) };
        if ret < 0 {
            Err(format!("mpv_command({:?}) failed: {}", args, ret))
        } else {
            Ok(())
        }
    }

    /// Observe a property for changes (events delivered via wait_event).
    pub fn observe_property(&self, name: &str, format: i32, userdata: u64) -> Result<(), String> {
        let name_c = CString::new(name).unwrap();
        let ret = unsafe { (self.fns.observe_property)(self.ctx, userdata, name_c.as_ptr(), format) };
        if ret < 0 {
            Err(format!("observe_property({}) failed: {}", name, ret))
        } else {
            Ok(())
        }
    }

    /// Wait for the next event (blocks for up to timeout seconds).
    pub fn wait_event(&self, timeout: f64) -> *mut mpv_event {
        unsafe { (self.fns.wait_event)(self.ctx, timeout) }
    }

    /// Get the raw mpv context pointer (for passing to native helper libs).
    pub fn ctx_ptr(&self) -> *mut mpv_handle {
        self.ctx
    }

    /// Get the functions table.
    pub fn fns(&self) -> &Arc<MpvFunctions> {
        &self.fns
    }
}

impl Drop for MpvHandle {
    fn drop(&mut self) {
        if !self.ctx.is_null() {
            unsafe { (self.fns.terminate_destroy)(self.ctx) };
        }
    }
}

/// Configure mpv with default options for Nuvio desktop playback.
/// Mirrors the Android MPVView.kt config + soia's config.
pub fn configure_mpv_defaults(mpv: &MpvHandle) -> Result<(), String> {
    // NOTE: vo and gpu-api are NOT set here — soia_utils_create handles
    // video output setup after mpv_initialize(). Setting vo before init
    // causes mpv to initialize the VO before the Vulkan surface exists.

    // MPV terminal output (errors and warnings only)
    mpv.set_option("terminal", "yes")?;
    mpv.set_option("msg-level", "all=warn")?;

    // Hardware acceleration
    mpv.set_option("hwdec", "auto")?;
    mpv.set_option("keep-open", "yes")?;

    // Caching (matches Android config)
    mpv.set_option("cache", "auto")?;
    mpv.set_option("cache-pause", "yes")?;
    mpv.set_option("demuxer-max-bytes", "67108864")?; // 64MB
    mpv.set_option("demuxer-max-back-bytes", "20971520")?; // 20MB
    mpv.set_option("cache-secs", "30")?;
    mpv.set_option("demuxer-seekable-cache", "yes")?;
    mpv.set_option("force-seekable", "yes")?;

    // HDR & Dolby Vision
    mpv.set_option("target-prim", "auto")?;
    mpv.set_option("target-trc", "auto")?;
    mpv.set_option("tone-mapping", "auto")?;
    mpv.set_option("hdr-compute-peak", "auto")?;
    mpv.set_option("vd-lavc-o", "strict=-2")?; // DV Profile 5

    // Subtitles
    mpv.set_option("sub-auto", "fuzzy")?;
    mpv.set_option("sub-font-size", "48")?;
    mpv.set_option("sub-color", "#FFFFFFFF")?;
    mpv.set_option("sub-border-size", "3")?;
    mpv.set_option("sub-border-color", "#FF000000")?;
    mpv.set_option("sub-shadow-offset", "2")?;
    mpv.set_option("sub-shadow-color", "#80000000")?;

    // yt-dlp integration (desktop bonus)
    mpv.set_option("ytdl", "yes")?;
    mpv.set_option("ytdl-format", "bv[height<=1080]+ba/b")?;

    Ok(())
}
