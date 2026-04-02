//! Raw FFI bindings to libmpv.
//! We use dynamic loading via libloading to avoid compile-time linkage.
//! This mirrors soia's approach of loading libmpv at runtime.

#![allow(non_camel_case_types, dead_code)]

use std::ffi::{c_char, c_double, c_int, c_void};

// --- mpv_handle opaque type ---
pub enum mpv_handle {}

// --- mpv_event types ---
pub const MPV_EVENT_NONE: c_int = 0;
pub const MPV_EVENT_SHUTDOWN: c_int = 1;
pub const MPV_EVENT_LOG_MESSAGE: c_int = 2;
pub const MPV_EVENT_GET_PROPERTY_REPLY: c_int = 3;
pub const MPV_EVENT_SET_PROPERTY_REPLY: c_int = 4;
pub const MPV_EVENT_COMMAND_REPLY: c_int = 5;
pub const MPV_EVENT_START_FILE: c_int = 6;
pub const MPV_EVENT_END_FILE: c_int = 7;
pub const MPV_EVENT_FILE_LOADED: c_int = 8;
pub const MPV_EVENT_TICK: c_int = 14;
pub const MPV_EVENT_CLIENT_MESSAGE: c_int = 16;
pub const MPV_EVENT_VIDEO_RECONFIG: c_int = 17;
pub const MPV_EVENT_AUDIO_RECONFIG: c_int = 18;
pub const MPV_EVENT_SEEK: c_int = 20;
pub const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
pub const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;

// --- mpv_format types ---
pub const MPV_FORMAT_NONE: c_int = 0;
pub const MPV_FORMAT_STRING: c_int = 1;
pub const MPV_FORMAT_OSD_STRING: c_int = 2;
pub const MPV_FORMAT_FLAG: c_int = 3;
pub const MPV_FORMAT_INT64: c_int = 4;
pub const MPV_FORMAT_DOUBLE: c_int = 5;
pub const MPV_FORMAT_NODE: c_int = 6;

// --- mpv_end_file_reason ---
pub const MPV_END_FILE_REASON_EOF: c_int = 0;
pub const MPV_END_FILE_REASON_STOP: c_int = 2;
pub const MPV_END_FILE_REASON_ERROR: c_int = 4;

// --- mpv_event struct ---
#[repr(C)]
pub struct mpv_event {
    pub event_id: c_int,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

// --- mpv_event_property struct ---
#[repr(C)]
pub struct mpv_event_property {
    pub name: *const c_char,
    pub format: c_int,
    pub data: *mut c_void,
}

// --- mpv_event_end_file struct ---
#[repr(C)]
pub struct mpv_event_end_file {
    pub reason: c_int,
    pub error: c_int,
}

// --- Core libmpv function signatures ---
// These are loaded dynamically at runtime via libloading.
// For now, we define the function pointer types.

pub type MpvCreate = unsafe extern "C" fn() -> *mut mpv_handle;
pub type MpvInitialize = unsafe extern "C" fn(ctx: *mut mpv_handle) -> c_int;
pub type MpvTerminateDestroy = unsafe extern "C" fn(ctx: *mut mpv_handle);
pub type MpvCommand = unsafe extern "C" fn(ctx: *mut mpv_handle, args: *mut *const c_char) -> c_int;
pub type MpvCommandString = unsafe extern "C" fn(ctx: *mut mpv_handle, args: *const c_char) -> c_int;
pub type MpvSetOptionString = unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char, data: *const c_char) -> c_int;
pub type MpvSetPropertyString = unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char, data: *const c_char) -> c_int;
pub type MpvGetPropertyString = unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char) -> *mut c_char;
pub type MpvGetPropertyDouble = unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char, data: *mut c_double) -> c_int;
pub type MpvGetPropertyFlag = unsafe extern "C" fn(ctx: *mut mpv_handle, name: *const c_char, data: *mut c_int) -> c_int;
pub type MpvObserveProperty = unsafe extern "C" fn(ctx: *mut mpv_handle, reply_userdata: u64, name: *const c_char, format: c_int) -> c_int;
pub type MpvWaitEvent = unsafe extern "C" fn(ctx: *mut mpv_handle, timeout: c_double) -> *mut mpv_event;
pub type MpvFree = unsafe extern "C" fn(data: *mut c_void);
pub type MpvErrorString = unsafe extern "C" fn(error: c_int) -> *const c_char;

/// Dynamically loaded libmpv function table.
/// Populated at startup by loading the libmpv shared library.
pub struct MpvFunctions {
    pub create: MpvCreate,
    pub initialize: MpvInitialize,
    pub terminate_destroy: MpvTerminateDestroy,
    pub command: MpvCommand,
    pub command_string: MpvCommandString,
    pub set_option_string: MpvSetOptionString,
    pub set_property_string: MpvSetPropertyString,
    pub get_property_string: MpvGetPropertyString,
    pub get_property_double: MpvGetPropertyDouble,
    pub observe_property: MpvObserveProperty,
    pub wait_event: MpvWaitEvent,
    pub free: MpvFree,
    pub error_string: MpvErrorString,
    _lib: libloading::Library,
}

// --- Native helper library (libnuvio_mpv) ---
// Handles CAMetalLayer creation and mpv render context on macOS.

pub enum nuvio_mpv_ctx {}

pub type NuvioMpvCreate = unsafe extern "C" fn(mpv_handle: *mut c_void, ns_view: *mut c_void) -> *mut nuvio_mpv_ctx;
pub type NuvioMpvRenderUpdate = unsafe extern "C" fn(ctx: *mut nuvio_mpv_ctx) -> c_int;
pub type NuvioMpvResize = unsafe extern "C" fn(ctx: *mut nuvio_mpv_ctx, width: u32, height: u32) -> c_int;
pub type NuvioMpvSyncLayer = unsafe extern "C" fn(ctx: *mut nuvio_mpv_ctx);
pub type NuvioMpvDestroy = unsafe extern "C" fn(ctx: *mut nuvio_mpv_ctx);
pub type NuvioMpvRenderNeeded = unsafe extern "C" fn(ctx: *mut nuvio_mpv_ctx) -> c_int;

pub struct NuvioMpvFunctions {
    pub create: NuvioMpvCreate,
    pub render_update: NuvioMpvRenderUpdate,
    pub resize: NuvioMpvResize,
    pub sync_layer: NuvioMpvSyncLayer,
    pub destroy: NuvioMpvDestroy,
    pub render_needed: NuvioMpvRenderNeeded,
    _lib: libloading::Library,
}

impl NuvioMpvFunctions {
    pub unsafe fn load(lib_path: &str) -> Result<Self, String> {
        let lib = libloading::Library::new(lib_path)
            .map_err(|e| format!("Failed to load libnuvio_mpv from {}: {}", lib_path, e))?;

        macro_rules! load_fn {
            ($name:expr) => {
                *lib.get::<*const ()>($name)
                    .map_err(|e| format!("Failed to load {}: {}", String::from_utf8_lossy($name), e))?
            };
        }

        Ok(Self {
            create: std::mem::transmute(load_fn!(b"nuvio_mpv_create\0")),
            render_update: std::mem::transmute(load_fn!(b"nuvio_mpv_render_update\0")),
            resize: std::mem::transmute(load_fn!(b"nuvio_mpv_resize\0")),
            sync_layer: std::mem::transmute(load_fn!(b"nuvio_mpv_sync_layer\0")),
            destroy: std::mem::transmute(load_fn!(b"nuvio_mpv_destroy\0")),
            render_needed: std::mem::transmute(load_fn!(b"nuvio_mpv_render_needed\0")),
            _lib: lib,
        })
    }
}

impl MpvFunctions {
    /// Load libmpv from the given path.
    /// On macOS: typically libmpv.2.dylib from libs/mpv/ or /opt/homebrew/lib/
    /// On Windows: libmpv-2.dll from libs/mpv/
    pub unsafe fn load(lib_path: &str) -> Result<Self, String> {
        let lib = libloading::Library::new(lib_path)
            .map_err(|e| format!("Failed to load libmpv from {}: {}", lib_path, e))?;

        macro_rules! load_fn {
            ($name:expr) => {
                *lib.get::<*const ()>($name)
                    .map_err(|e| format!("Failed to load {}: {}", String::from_utf8_lossy($name), e))?
            };
        }

        Ok(Self {
            create: std::mem::transmute(load_fn!(b"mpv_create\0")),
            initialize: std::mem::transmute(load_fn!(b"mpv_initialize\0")),
            terminate_destroy: std::mem::transmute(load_fn!(b"mpv_terminate_destroy\0")),
            command: std::mem::transmute(load_fn!(b"mpv_command\0")),
            command_string: std::mem::transmute(load_fn!(b"mpv_command_string\0")),
            set_option_string: std::mem::transmute(load_fn!(b"mpv_set_option_string\0")),
            set_property_string: std::mem::transmute(load_fn!(b"mpv_set_property_string\0")),
            get_property_string: std::mem::transmute(load_fn!(b"mpv_get_property_string\0")),
            get_property_double: std::mem::transmute(load_fn!(b"mpv_get_property_double\0")),
            observe_property: std::mem::transmute(load_fn!(b"mpv_observe_property\0")),
            wait_event: std::mem::transmute(load_fn!(b"mpv_wait_event\0")),
            free: std::mem::transmute(load_fn!(b"mpv_free\0")),
            error_string: std::mem::transmute(load_fn!(b"mpv_error_string\0")),
            _lib: lib,
        })
    }
}
