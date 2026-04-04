# Tauri Desktop Builds — Status & Outstanding Work

**Last updated:** 2026-04-02
**Branch:** `macos-builds`
**Commits:** 5 (since `578fb9d9` merge from main)

---

## What's Built

### Phase 0: Project Scaffolding — COMPLETE
- `vite.config.ts` — Vite 8 with RN→RNW alias, `shimMissingExports`, JSX-in-.js (`moduleTypes`), `.web.tsx` extension priority, EXPO_PUBLIC env var loading
- `index.html` — web entry point (replaced marketing page)
- `index.web.ts` — AppRegistry bootstrap + reanimated global polyfills + onboarding skip
- `src-tauri/` — Tauri v2 with `macOSPrivateApi`, transparent window, devtools
- `package.json` — scripts: `dev:web`, `build:web`, `tauri:dev`, `tauri:build`
- Dependencies: `@tauri-apps/cli`, `@tauri-apps/api`, `vite`, `@vitejs/plugin-react`, `@tauri-apps/plugin-store`

### Phase 1: Web Compatibility — ~85% COMPLETE
**27 web stubs** covering all native packages:

| Stub | Package(s) | Notes |
|------|-----------|-------|
| `sentry.web.ts` | `@sentry/react-native` | No-op (wraps entire app via `Sentry.wrap()`) |
| `mmkv.web.ts` | `react-native-mmkv` | Tauri Store (disk) + localStorage fallback. Exports `createMMKV()` |
| `fast-image.web.tsx` | `@d11/react-native-fast-image` (53 files) | Maps to RNW `<Image>` + static props |
| `flash-list.web.tsx` | `@shopify/flash-list`, `@legendapp/list` | Re-exports `FlatList` + `LegendList` |
| `bottom-sheet.web.tsx` | `@gorhom/bottom-sheet` (10 files) | Modal-based replacement with imperative API |
| `blur.web.tsx` | `@react-native-community/blur`, `expo-blur` | CSS `backdrop-filter` |
| `slider.web.tsx` | `@react-native-community/slider` | HTML `<input type="range">` |
| `native-stack.web.ts` | `@react-navigation/native-stack` | Re-exports `@react-navigation/stack` |
| `worklets.web.ts` | `react-native-worklets` | 16 exports for reanimated v4 |
| `expo-modules-core.web.ts` | `expo-modules-core` | EventEmitter, NativeModule, SharedObject, etc. |
| `expo-constants.web.ts` | `expo-constants` | Static config object |
| `expo-font.web.ts` | `expo-font` | `isLoaded()` returns true |
| `status-bar.web.ts` | `expo-status-bar` | No-op (no status bar on desktop) |
| `skia.web.ts` | `@shopify/react-native-skia` | No-op components + `Easing`, `vec`, `interpolate` |
| `react-native-web-shim.ts` | (unused, kept for reference) | Earlier shim attempt |
| `noop.ts` | 12 packages (google-cast, immersive-mode, haptics, etc.) | Generic no-op |
| + 11 more | carousel, color-picker, markdown, toast, netinfo, posthog, lottie, file-system, image-colors, background-downloader, codegenNativeComponent | Various |

**RNW patch** (`patches/react-native-web+0.21.2.patch`):
- Adds `ToastAndroid`, `ActionSheetIOS`, `requireNativeComponent`, `unstable_batchedUpdates` to RNW exports

**Build status:**
- `vite build` — **PASSES** (2311 modules, ~1.2s)
- `tauri build` — **PASSES** (produces `Nuvio.app` + `Nuvio_0.1.0_aarch64.dmg`)
- `vite dev` — starts cleanly, but runtime `Easing` issue from reanimated (Rolldown lazy init bug, prod build unaffected)

**Runtime status:**
- App launches in Tauri window
- Services initialize (UpdateService, auth state, i18n, campaigns)
- **Screen is dark** — navigation renders but UI content not visible (see Outstanding)

### Phase 2: MPV Video Player — SCAFFOLD COMPLETE

**Rust backend** (`src-tauri/src/`):
- `mpv/ffi.rs` — Dynamic FFI bindings to libmpv + libnuvio_mpv via `libloading`
- `mpv/handle.rs` — `MpvHandle` with full API (command, properties, observe, lifecycle)
- `mpv/event_loop.rs` — Background thread: `mpv_wait_event` → Tauri events (`mpv-progress-update`, `mpv-file-loaded`, `mpv-end-file`, `mpv-playback-restart`)
- `mpv/handle.rs::configure_mpv_defaults()` — Android MPVView.kt config ported (hwdec, cache, HDR, subtitles, yt-dlp)
- `platform/mod.rs` — Native view extraction via `raw-window-handle`
- `platform/macos.rs` — CAMetalLayer geometry sync stubs
- `lib.rs` — 7 Tauri commands: `load_file`, `mpv_command`, `mpv_set_property`, `mpv_get_property`, `cycle_pause`, `seek_video`, `mpv_available`
- Lazy init: `ensure_mpv()` finds libmpv (bundled → homebrew → system), creates handle, starts event loop
- `tauri-plugin-store` registered for persistent storage

**Native helper** (`src-tauri/native/macos/`):
- `nuvio_mpv.h` — C API: `create`, `render_update`, `resize`, `sync_layer`, `destroy`, `render_needed`
- `nuvio_mpv.m` — ObjC implementation: CAMetalLayer sublayer, Metal device, mode 0 (mpv-driven rendering) / mode 2 (render context)
- Compiles to `libnuvio_mpv.dylib` (70KB) via `scripts/build_nuvio_mpv.sh`
- API surface aligned with soia's `libsoia_utils` (research confirmed ObjC source is closed-source; API reverse-engineered from Rust FFI declarations)

**Frontend** (`src/components/player/desktop/`):
- `hooks/useMpvPlayer.ts` — React hook: state management, event listeners, all player controls via `invoke()`
- `DesktopPlayer.web.tsx` — Transparent overlay with controls bar, progress, keyboard shortcuts

**Scripts:**
- `scripts/setup_libs_macos.sh` — Downloads libmpv from homebrew, normalizes install names
- `scripts/build_nuvio_mpv.sh` — Compiles ObjC native helper to dylib

### Phase 4: Tauri Store — COMPLETE
- `@tauri-apps/plugin-store` added (Rust + JS)
- MMKV stub upgraded: Tauri Store for disk persistence, localStorage fallback
- In-memory cache for synchronous reads (MMKV API is sync, Tauri Store is async)
- Store permissions in `capabilities/default.json`

### Phase 3: Shaka Player — NOT STARTED
### Phase 5: Desktop Polish — NOT STARTED
### Phase 6: Build & CI — NOT STARTED

---

## Outstanding Work

### High Priority (get UI visible + video playing)

1. **Debug dark screen** — App boots but navigation renders with no visible content
   - Most likely cause: `@react-navigation/stack` (our web alias for native-stack) may need `cardStyle: { backgroundColor }` instead of `contentStyle` which is native-stack-only
   - Could also be: SafeAreaProvider not providing insets on web, or a layout issue with the custom tab bar (uses BlurView, LinearGradient which are stubbed)
   - Debug approach: inspect DOM in devtools, check if elements render with height > 0

2. **Wire `libnuvio_mpv` into MPV init** — `ensure_mpv()` in `lib.rs` currently doesn't call the native helper
   - Need to: load `libnuvio_mpv.dylib`, get NSView pointer via `platform::get_native_view()`, call `nuvio_mpv_create(mpv_ctx, ns_view)`
   - Add window resize handler to call `nuvio_mpv_sync_layer()`
   - Wire the `NuvioMpvFunctions` struct loading into startup

3. **Test with real libmpv** — Run `scripts/setup_libs_macos.sh` (requires `brew install mpv`), then test video playback end-to-end

4. **Fix Vite dev server Easing issue** — Reanimated's `Easing` is undefined in dev mode due to Rolldown lazy init in pre-bundled deps. Production build works. Low priority but affects dev workflow.

### Medium Priority

5. **CORS for API calls** — `tauri://localhost` origin rejected by external APIs (campaign server, etc.)
   - Options: Tauri HTTP plugin (bypasses CORS from Rust side), or add origin to server allowlists

6. **Image/asset 404s** — Some images fail to load in Tauri webview
   - May need asset path resolution or Tauri protocol handler

7. **`react-native-screens`** — May need a web stub (imported transitively by navigation)

8. **`playerSelection.ts`** — Needs `Platform.OS === 'web'` check to avoid selecting Android player on desktop

### Lower Priority

9. **Phase 3: Shaka Player** — JS-based HLS/DASH fallback when MPV not available
10. **Phase 5: Desktop polish** — System tray, native menus, window state, auto-updater, deep links, fullscreen, media keys
11. **Phase 6: CI/CD** — GitHub Actions for macOS + Windows builds, code signing, notarization

---

## File Inventory

### New files (this branch)
```
# Web entry
index.html                              # Tauri HTML entry
index.web.ts                            # AppRegistry bootstrap + polyfills

# Vite config
vite.config.ts                          # Full config with aliases, stubs, env vars

# Web stubs (27 files)
src/stubs/*.ts, src/stubs/*.tsx

# Desktop player
src/components/player/desktop/DesktopPlayer.web.tsx
src/components/player/desktop/hooks/useMpvPlayer.ts

# Rust backend
src-tauri/src/lib.rs                    # Tauri commands + MPV init
src-tauri/src/mpv/mod.rs
src-tauri/src/mpv/ffi.rs                # libmpv + libnuvio_mpv FFI
src-tauri/src/mpv/handle.rs             # MpvHandle + config
src-tauri/src/mpv/event_loop.rs         # Event thread
src-tauri/src/platform/mod.rs           # Native view extraction
src-tauri/src/platform/macos.rs         # macOS specifics

# Native helper
src-tauri/native/macos/nuvio_mpv.h      # C API header
src-tauri/native/macos/nuvio_mpv.m      # ObjC implementation
src-tauri/libs/mpv/libnuvio_mpv.dylib   # Compiled dylib

# Build scripts
scripts/setup_libs_macos.sh             # Download libmpv
scripts/build_nuvio_mpv.sh              # Compile native helper

# RNW patch
patches/react-native-web+0.21.2.patch   # Adds native API shims
```

### Modified files
```
package.json                            # Scripts + deps
src/services/codecService.ts            # Desktop codec matrix
src-tauri/tauri.conf.json               # Window config
src-tauri/Cargo.toml                    # Rust deps
src-tauri/capabilities/default.json     # Store permissions
```
