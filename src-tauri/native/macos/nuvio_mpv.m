// nuvio_mpv.m — Native MPV rendering helper for macOS.
// Creates a CAMetalLayer sublayer in the Tauri NSView.
// In mode 0 (default): sets vo=libmpv and mpv drives its own rendering.
// In mode 2 (render context): uses mpv_render_context for explicit frame control.
//
// API surface matches soia's libsoia_utils for compatibility.

#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <Metal/Metal.h>
#include <dlfcn.h>
#include <stdint.h>
#include <stdatomic.h>

#include "nuvio_mpv.h"

// --- mpv function pointers (loaded from already-loaded libmpv) ---

typedef void *mpv_handle;
typedef void *mpv_render_context;

typedef struct {
    int type;
    void *data;
} mpv_render_param;

typedef int (*fn_mpv_set_option_string)(mpv_handle, const char *, const char *);
typedef int (*fn_mpv_render_context_create)(mpv_render_context *, mpv_handle, mpv_render_param *);
typedef void (*fn_mpv_render_context_set_update_callback)(mpv_render_context, void (*)(void *), void *);
typedef uint64_t (*fn_mpv_render_context_update)(mpv_render_context);
typedef int (*fn_mpv_render_context_render)(mpv_render_context, mpv_render_param *);
typedef void (*fn_mpv_render_context_report_swap)(mpv_render_context);
typedef void (*fn_mpv_render_context_free)(mpv_render_context);

// --- Context struct ---

struct nuvio_mpv_ctx {
    mpv_handle mpv;
    mpv_render_context render_ctx;
    NSView *ns_view;
    CAMetalLayer *metal_layer;
    id<MTLDevice> metal_device;
    int mode; // 0 = native (vo=libmpv), 2 = render context
    atomic_int render_needed;

    // mpv function pointers
    fn_mpv_set_option_string set_option_string;
    fn_mpv_render_context_create render_context_create;
    fn_mpv_render_context_set_update_callback render_context_set_update_callback;
    fn_mpv_render_context_update render_context_update;
    fn_mpv_render_context_render render_context_render;
    fn_mpv_render_context_report_swap render_context_report_swap;
    fn_mpv_render_context_free render_context_free;
};

// --- Render update callback ---

static void on_render_update(void *cb_ctx) {
    struct nuvio_mpv_ctx *ctx = (struct nuvio_mpv_ctx *)cb_ctx;
    atomic_store(&ctx->render_needed, 1);
}

// --- Load mpv symbols from already-loaded library ---

static int load_mpv_symbols(struct nuvio_mpv_ctx *ctx) {
    // dlopen(NULL) searches already-loaded libraries
    void *lib = dlopen(NULL, RTLD_NOW);
    if (!lib) return -1;

    ctx->set_option_string = dlsym(lib, "mpv_set_option_string");
    ctx->render_context_create = dlsym(lib, "mpv_render_context_create");
    ctx->render_context_set_update_callback = dlsym(lib, "mpv_render_context_set_update_callback");
    ctx->render_context_update = dlsym(lib, "mpv_render_context_update");
    ctx->render_context_render = dlsym(lib, "mpv_render_context_render");
    ctx->render_context_report_swap = dlsym(lib, "mpv_render_context_report_swap");
    ctx->render_context_free = dlsym(lib, "mpv_render_context_free");

    dlclose(lib);
    return ctx->set_option_string ? 0 : -1;
}

// --- Public API ---

nuvio_mpv_ctx* nuvio_mpv_create(void* mpv_handle_ptr, void* ns_view_ptr) {
    @autoreleasepool {
        struct nuvio_mpv_ctx *ctx = calloc(1, sizeof(struct nuvio_mpv_ctx));
        if (!ctx) return NULL;

        ctx->mpv = mpv_handle_ptr;
        ctx->ns_view = (__bridge NSView *)ns_view_ptr;
        ctx->mode = 0; // Default: native rendering (vo=libmpv)
        atomic_init(&ctx->render_needed, 0);

        if (load_mpv_symbols(ctx) != 0) {
            NSLog(@"[nuvio_mpv] Failed to load mpv symbols");
            free(ctx);
            return NULL;
        }

        // Create Metal device
        ctx->metal_device = MTLCreateSystemDefaultDevice();
        if (!ctx->metal_device) {
            NSLog(@"[nuvio_mpv] Failed to create Metal device");
            free(ctx);
            return NULL;
        }

        // Create CAMetalLayer
        ctx->metal_layer = [CAMetalLayer layer];
        ctx->metal_layer.device = ctx->metal_device;
        ctx->metal_layer.pixelFormat = MTLPixelFormatBGRA8Unorm;
        ctx->metal_layer.framebufferOnly = YES;
        ctx->metal_layer.opaque = YES;

        if (ctx->ns_view.window) {
            ctx->metal_layer.contentsScale = ctx->ns_view.window.backingScaleFactor;
        } else {
            ctx->metal_layer.contentsScale = 2.0; // Retina default
        }

        // Insert as sublayer at index 0 (behind the WebView)
        dispatch_sync(dispatch_get_main_queue(), ^{
            if (!ctx->ns_view.layer) {
                ctx->ns_view.wantsLayer = YES;
            }
            ctx->metal_layer.frame = ctx->ns_view.bounds;
            [ctx->ns_view.layer insertSublayer:ctx->metal_layer atIndex:0];
        });

        // Mode 0: tell mpv to render using its own vo into this view
        // vo=libmpv tells mpv to use the native rendering pipeline
        if (ctx->set_option_string) {
            ctx->set_option_string(ctx->mpv, "vo", "gpu-next");
            ctx->set_option_string(ctx->mpv, "gpu-api", "vulkan");
        }

        NSLog(@"[nuvio_mpv] Created context (mode=%d) with Metal device: %@",
              ctx->mode, ctx->metal_device.name);
        return ctx;
    }
}

int nuvio_mpv_render_update(nuvio_mpv_ctx* ctx) {
    if (!ctx) return -1;

    // Only meaningful in render context mode (mode=2)
    if (ctx->mode != 2 || !ctx->render_ctx) return 0;

    if (atomic_exchange(&ctx->render_needed, 0)) {
        if (ctx->render_context_update) {
            ctx->render_context_update(ctx->render_ctx);
        }
    }
    return 0;
}

int nuvio_mpv_resize(nuvio_mpv_ctx* ctx, uint32_t width, uint32_t height) {
    if (!ctx || !ctx->metal_layer) return -1;

    dispatch_async(dispatch_get_main_queue(), ^{
        ctx->metal_layer.drawableSize = CGSizeMake(width, height);
    });
    return 0;
}

void nuvio_mpv_sync_layer(nuvio_mpv_ctx* ctx) {
    if (!ctx || !ctx->metal_layer || !ctx->ns_view) return;

    dispatch_async(dispatch_get_main_queue(), ^{
        ctx->metal_layer.frame = ctx->ns_view.bounds;
        if (ctx->ns_view.window) {
            ctx->metal_layer.contentsScale = ctx->ns_view.window.backingScaleFactor;
        }
    });
}

void nuvio_mpv_destroy(nuvio_mpv_ctx* ctx) {
    if (!ctx) return;

    if (ctx->render_ctx && ctx->render_context_free) {
        ctx->render_context_free(ctx->render_ctx);
        ctx->render_ctx = NULL;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
        [ctx->metal_layer removeFromSuperlayer];
    });

    free(ctx);
    NSLog(@"[nuvio_mpv] Destroyed context");
}

int nuvio_mpv_render_needed(nuvio_mpv_ctx* ctx) {
    if (!ctx) return 0;
    return atomic_load(&ctx->render_needed);
}
