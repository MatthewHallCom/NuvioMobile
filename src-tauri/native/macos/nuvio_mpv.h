// nuvio_mpv.h — C API for the native MPV rendering helper.
// Creates a CAMetalLayer sublayer in the Tauri NSView and wires it
// to mpv's render context API for GPU-accelerated video rendering.
//
// Based on the soia pattern (FengZeng/soia libsoia_utils).

#ifndef NUVIO_MPV_H
#define NUVIO_MPV_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Opaque handle to the native rendering context
typedef struct nuvio_mpv_ctx nuvio_mpv_ctx;

/// Create the native rendering context.
/// - mpv_handle: pointer to an initialized mpv_handle (from mpv_create + mpv_initialize)
/// - ns_view: pointer to the NSView of the Tauri window
/// Returns: opaque context pointer, or NULL on failure
nuvio_mpv_ctx* nuvio_mpv_create(void* mpv_handle, void* ns_view);

/// Trigger a render update. Call this from a dedicated render thread.
/// mpv will render the current frame into the CAMetalLayer.
/// Returns 0 on success, -1 on error.
int nuvio_mpv_render_update(nuvio_mpv_ctx* ctx);

/// Resize the render target. Call on every window resize event.
/// width/height are in PHYSICAL PIXELS (not logical) on macOS.
int nuvio_mpv_resize(nuvio_mpv_ctx* ctx, uint32_t width, uint32_t height);

/// Sync the CAMetalLayer frame to match the NSView bounds.
/// Call after resize or scale factor change.
void nuvio_mpv_sync_layer(nuvio_mpv_ctx* ctx);

/// Destroy the rendering context and clean up.
void nuvio_mpv_destroy(nuvio_mpv_ctx* ctx);

/// Check if the render context needs an update (non-blocking).
/// Returns 1 if a render is needed, 0 otherwise.
int nuvio_mpv_render_needed(nuvio_mpv_ctx* ctx);

#ifdef __cplusplus
}
#endif

#endif // NUVIO_MPV_H
