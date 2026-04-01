//! MPV event loop — runs on a dedicated thread, emits Tauri events to the frontend.

use std::ffi::CStr;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::ffi::*;
use super::handle::MpvHandle;

#[derive(Serialize, Clone)]
pub struct ProgressUpdate {
    pub time_pos: f64,
    pub duration: f64,
    pub is_playing: bool,
    pub is_buffering: bool,
}

#[derive(Serialize, Clone)]
pub struct EndFileEvent {
    pub reason: String,
}

#[derive(Serialize, Clone)]
pub struct TrackInfo {
    pub id: i64,
    pub kind: String, // "audio", "video", "sub"
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub selected: bool,
}

#[derive(Serialize, Clone)]
pub struct FileLoadedEvent {
    pub tracks: Vec<TrackInfo>,
}

/// Start the event listener loop on a background thread.
/// This blocks forever until mpv shuts down.
pub fn start_event_loop(mpv: Arc<MpvHandle>, app_handle: AppHandle) {
    std::thread::spawn(move || {
        log::info!("MPV event loop started");
        loop {
            let event = mpv.wait_event(0.5); // 500ms timeout
            if event.is_null() {
                continue;
            }
            let event = unsafe { &*event };

            match event.event_id {
                MPV_EVENT_NONE => continue,

                MPV_EVENT_SHUTDOWN => {
                    log::info!("MPV shutdown event received");
                    break;
                }

                MPV_EVENT_FILE_LOADED => {
                    log::info!("MPV file loaded");
                    // Parse track list
                    if let Some(track_list_str) = mpv.get_property_string("track-list") {
                        // track-list is a complex node, but as string it's a JSON-like format
                        // For now, emit a simple event; track parsing can be improved later
                        let _ = app_handle.emit("mpv-file-loaded", serde_json::json!({
                            "trackList": track_list_str,
                        }));
                    } else {
                        let _ = app_handle.emit("mpv-file-loaded", serde_json::json!({}));
                    }
                }

                MPV_EVENT_END_FILE => {
                    if !event.data.is_null() {
                        let end_file = unsafe { &*(event.data as *const mpv_event_end_file) };
                        let reason = match end_file.reason {
                            MPV_END_FILE_REASON_EOF => "eof",
                            MPV_END_FILE_REASON_STOP => "stop",
                            MPV_END_FILE_REASON_ERROR => "error",
                            _ => "unknown",
                        };
                        log::info!("MPV end file: {}", reason);
                        let _ = app_handle.emit("mpv-end-file", EndFileEvent {
                            reason: reason.to_string(),
                        });
                    }
                }

                MPV_EVENT_PLAYBACK_RESTART => {
                    log::info!("MPV playback restart (seek completed)");
                    let _ = app_handle.emit("mpv-playback-restart", ());
                }

                MPV_EVENT_TICK => {
                    // Emit progress update
                    let time_pos = mpv.get_property_double("time-pos").unwrap_or(0.0);
                    let duration = mpv.get_property_double("duration").unwrap_or(0.0);
                    let pause_str = mpv.get_property_string("pause").unwrap_or_default();
                    let cache_str = mpv.get_property_string("paused-for-cache").unwrap_or_default();

                    let _ = app_handle.emit("mpv-progress-update", ProgressUpdate {
                        time_pos,
                        duration,
                        is_playing: pause_str != "yes",
                        is_buffering: cache_str == "yes",
                    });
                }

                MPV_EVENT_PROPERTY_CHANGE => {
                    if !event.data.is_null() {
                        let prop = unsafe { &*(event.data as *const mpv_event_property) };
                        let name = unsafe { CStr::from_ptr(prop.name).to_string_lossy() };

                        // Emit property change as a generic event
                        let value = match prop.format {
                            MPV_FORMAT_STRING if !prop.data.is_null() => {
                                let s = unsafe { CStr::from_ptr(*(prop.data as *const *const i8)) };
                                serde_json::Value::String(s.to_string_lossy().into_owned())
                            }
                            MPV_FORMAT_FLAG if !prop.data.is_null() => {
                                let flag = unsafe { *(prop.data as *const i32) };
                                serde_json::Value::Bool(flag != 0)
                            }
                            MPV_FORMAT_DOUBLE if !prop.data.is_null() => {
                                let val = unsafe { *(prop.data as *const f64) };
                                serde_json::json!(val)
                            }
                            MPV_FORMAT_INT64 if !prop.data.is_null() => {
                                let val = unsafe { *(prop.data as *const i64) };
                                serde_json::json!(val)
                            }
                            _ => serde_json::Value::Null,
                        };

                        let _ = app_handle.emit("mpv-property-change", serde_json::json!({
                            "name": name.as_ref(),
                            "value": value,
                        }));
                    }
                }

                _ => {} // Ignore other events
            }
        }
        log::info!("MPV event loop ended");
    });
}
