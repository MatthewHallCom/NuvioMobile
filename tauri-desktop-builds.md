# Tauri Desktop Builds — Implementation Plan

## Summary

Add macOS and Windows desktop builds to NuvioMobile using Tauri v2 with a dual video player strategy: MPV (via custom native helper library, following soia's `libsoia_utils` pattern) for full codec/subtitle/HDR support, and Shaka Player (in-webview) as a lightweight fallback for standard HLS/DASH streams. The existing React Native codebase compiles to web via `react-native-web` + Vite, then runs inside Tauri's native webview.

**Reference implementation:** [FengZeng/soia](https://github.com/FengZeng/soia) — Tauri v2 media player with proven macOS MPV integration via `CAMetalLayer` + `mpv_render_context`.

---

## Prerequisites & Dev Setup

### Required Tooling
- **Rust toolchain** — `rustup` with stable channel (MSRV 1.77.2+)
- **Node.js** — v18+ (already in use)
- **Xcode** — latest (for macOS builds, ObjC compilation)
- **Visual Studio Build Tools** — (for Windows builds)
- **Homebrew** — for installing mpv/libmpv on macOS (`brew install mpv`)
- **Tauri CLI** — `npm install -g @tauri-apps/cli@^2`

### Library Dependencies (per platform)
- **macOS**: `libmpv.2.dylib`, `libnuvio_mpv.dylib`, `libMoltenVK.dylib`, `libvulkan.1.dylib`, ffmpeg dylibs
- **Windows**: `libmpv-2.dll`, `libnuvio_mpv.dll`, ffmpeg DLLs

### Dev Workflow
1. `npm run dev:web` — starts Vite dev server on port 1420 (web-only, for rapid UI iteration)
2. `npm run tauri:dev` — starts Vite + Tauri together (full desktop app with hot reload for React, auto-recompile for Rust)
3. `npm run tauri:build` — production build (DMG/app on macOS, MSI/exe on Windows)
4. Mobile builds remain unchanged: `npm run ios`, `npm run android`, `npm run mac` (Catalyst)

### RNW Version Note
`react-native-web@0.21.2` officially targets React Native 0.76, but this project uses RN 0.81.4. If incompatibilities arise, upgrade to `react-native-web@0.22+` or pin to the latest compatible version. Test early in Phase 1.

---

## Requirements

### Must Have
- macOS desktop app (DMG/app bundle) with video playback, subtitles, multi-audio tracks
- Windows desktop app (MSI/NSIS installer) with video playback, subtitles, multi-audio tracks
- HLS and DASH adaptive streaming
- All current codecs: H.264, HEVC, VP9, AV1, XviD, MPEG-2
- SRT, VTT, and ASS/SSA subtitle rendering with full styling
- Hardware-accelerated video decoding
- Multiple audio track selection
- Playback speed control (0.25x-2x)
- Skip intro/outro (IntroDB integration)
- Watch progress tracking and resume
- All existing service integrations (Trakt, Simkl, TMDB, Supabase sync)
- Keyboard shortcuts replacing mobile gestures

### Should Have
- System tray with playback controls
- Desktop notifications
- Auto-update mechanism
- Deep link handling (`nuvio://` protocol)
- HDR/Dolby Vision passthrough where hardware supports it
- macOS Now Playing integration (media keys, Control Center)
- Native Picture-in-Picture

### Won't Have (This Phase)
- Linux builds (webkit2gtk MSE issues make this a separate effort)
- Google Cast / AirPlay from desktop (no clean web path)
- Touch gesture controls (replaced by keyboard/mouse)
- Device brightness control

### Mac Catalyst Migration
The current `npm run mac` builds via Mac Catalyst. This Tauri approach is a separate, parallel path — not a replacement. Both can coexist:
- Catalyst builds continue working for users who prefer them
- Tauri builds target users who want Windows support + lighter binary
- No data migration needed (Tauri uses its own storage via `@tauri-apps/plugin-store`)
- When Tauri desktop reaches feature parity, evaluate deprecating Catalyst

---

## Architecture

```
NuvioMobile/
├── src/                          # Shared RN source
│   ├── components/player/
│   │   ├── ios/                  # Existing — KSPlayer (unchanged)
│   │   ├── android/              # Existing — MPV + ExoPlayer (unchanged)
│   │   └── desktop/              # NEW — Tauri player bridge
│   │       ├── DesktopPlayer.web.tsx
│   │       ├── ShakaPlayer.web.tsx
│   │       ├── SubtitleOverlay.web.tsx
│   │       └── hooks/
│   │           ├── useMpvPlayer.ts
│   │           ├── useShakaPlayer.ts
│   │           └── useDesktopPlayerBridge.ts
│   ├── stubs/                    # NEW — web compatibility stubs
│   │   ├── noop.ts
│   │   ├── mmkv.web.ts
│   │   ├── fast-image.web.tsx
│   │   ├── flash-list.web.tsx
│   │   ├── bottom-sheet.web.tsx
│   │   ├── blur.web.tsx
│   │   ├── slider.web.tsx
│   │   ├── image-colors.web.ts
│   │   ├── carousel.web.tsx
│   │   ├── haptics.web.ts
│   │   ├── file-system.web.ts
│   │   ├── netinfo.web.ts
│   │   └── ... (see Phase 1 audit)
│   ├── navigation/
│   │   └── AppNavigator.web.tsx  # NEW — web-specific navigator
│   └── services/
│       └── codecService.ts       # MODIFY — add desktop codec matrix
│
├── vite.config.ts                # NEW — web bundler with RN->RNW alias + stubs
├── index.web.ts                  # NEW — web/Tauri entry point
├── index.web.html                # NEW — HTML shell for Tauri webview
│
├── src-tauri/                    # NEW — Tauri/Rust backend
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── build.rs                  # Links libmpv + libnuvio_mpv
│   ├── capabilities/
│   │   └── default.json          # Permissions: fs, window, notification, shell
│   ├── icons/
│   ├── libs/mpv/                 # Bundled: libmpv, libnuvio_mpv, MoltenVK, ffmpeg dylibs
│   ├── native/                   # Native helper library source
│   │   ├── macos/nuvio_mpv.m    # ObjC: CAMetalLayer + mpv_render_context
│   │   └── windows/nuvio_mpv.c  # C: HWND embedding
│   └── src/
│       ├── main.rs               # Desktop entry
│       ├── lib.rs                # Tauri command registration + window event handlers
│       ├── app_bootstrap.rs      # Startup: extract NSView, init MPV, install handlers
│       ├── mpv/
│       │   ├── mod.rs            # Re-exports
│       │   ├── ffi.rs            # extern "C" bindings to libmpv + libnuvio_mpv
│       │   ├── handle.rs         # MpvHandle: init, render loop, property observation
│       │   └── event_loop.rs     # mpv_wait_event thread -> Tauri event emission
│       ├── platform/
│       │   ├── mod.rs            # cfg-gated re-exports
│       │   ├── macos.rs          # NSView, CAMetalLayer sync, PiP, Now Playing
│       │   └── windows.rs        # HWND helpers
│       └── storage.rs            # Desktop storage (replaces MMKV)
│
├── scripts/
│   ├── setup_libs_macos.sh       # NEW — download + normalize libmpv dylibs for dev
│   ├── setup_libs_windows.ps1    # NEW — download libmpv DLLs for dev
│   ├── bundle_libs_macos.sh      # NEW — bundle dylibs into .app for release
│   └── run_tauri.mjs             # NEW — inject DYLD_FALLBACK_LIBRARY_PATH for dev
│
├── ios/                          # Existing (unchanged)
├── android/                      # Existing (unchanged)
└── package.json                  # MODIFY — add desktop scripts + deps
```

### Video Player Decision Tree

```
Stream arrives
    |
    +- Platform.OS !== 'web'  -> existing iOS/Android players (no change)
    |
    +- Platform.OS === 'web' (Tauri desktop)
        |
        +- User preference = "native" (default)
        |   +- MPV via libnuvio_mpv (CAMetalLayer on macOS, HWND on Windows)
        |       +- All codecs (H.264, HEVC, VP9, AV1, XviD, MPEG-2)
        |       +- ASS/SSA subtitles via libass
        |       +- Hardware decode via DXVA2/VideoToolbox
        |       +- HDR tone-mapping
        |
        +- MPV unavailable OR user preference = "web"
            +- Shaka Player (in-webview)
                +- HLS + DASH (H.264, VP9)
                +- VTT subtitles native + ASS via jassub/wasm
                +- Hardware decode via webview engine
```

---

## Native Dependency Audit

Complete audit of every non-web-compatible package in the codebase. This drives Phase 1 stubbing work.

### Has Web Support (no action needed beyond Vite config)
| Package | Files | Notes |
|---------|-------|-------|
| `react-native-reanimated` | 53 | Needs Babel plugin in Vite config |
| `react-native-safe-area-context` | 50 | Built-in RNW support |
| `@expo/vector-icons` | 98 | Font loading config needed |
| `expo-linear-gradient` | 34 | CSS gradients on web |
| `react-native-svg` | 11 | Built-in RNW support |
| `react-native-video` | 8 | HTML5 `<video>` on web |
| `react-native-paper` | 3 | Built-in RNW support |
| `react-native-gesture-handler` | 7 | Web support, needs setup |
| `expo-web-browser` | 3 | `window.open()` on web |

### Needs Vite Alias to Web Package
| Package | Files | Web Replacement | Stub Complexity |
|---------|-------|----------------|-----------------|
| `@d11/react-native-fast-image` | 53 | `<img>` wrapper component | Simple |
| `@sentry/react-native` | 1 (App.tsx wraps entire app) | `@sentry/browser` or no-op | Simple |
| `posthog-react-native` | 1 | `posthog-js` or no-op | Simple |
| `lottie-react-native` | 5 | `lottie-web` wrapper | Simple |
| `@react-native-community/netinfo` | 1 | `navigator.onLine` hook | Simple |
| `@backpackapp-io/react-native-toast` | 1 | `react-hot-toast` or `sonner` | Simple |
| `react-native-markdown-display` | 1 | `react-markdown` | Simple |

### Needs Custom `.web.tsx` Stub
| Package | Files | Stub Strategy | Complexity |
|---------|-------|--------------|------------|
| `react-native-mmkv` | 2 | `createMMKV()` -> localStorage wrapper | Simple |
| `@gorhom/bottom-sheet` | 10 | Modal/Portal-based replacement | Medium |
| `@shopify/flash-list` | 4 | Re-export `FlatList` from RNW | Medium |
| `@react-native-community/blur` | 5 | CSS `backdrop-filter` wrapper | Simple |
| `@react-native-community/slider` | 2 | HTML `<input type="range">` | Simple |
| `react-native-image-colors` | 1 | Return default colors (or vibrant.js) | Simple |
| `react-native-reanimated-carousel` | 1 | Static list fallback | Medium |
| `react-native-wheel-color-picker` | 1 | HTML color input | Simple |
| `@shopify/react-native-skia` | 1 | No-op (already disabled for Catalyst) | Trivial |

### Needs No-Op Stub
| Package | Files | Notes |
|---------|-------|-------|
| `react-native-google-cast` | - | Already disabled for Catalyst |
| `react-native-immersive-mode` | - | Android-only, try/catch guarded |
| `@adrianso/react-native-device-brightness` | - | No web equivalent |
| `@kesha-antonov/react-native-background-downloader` | 2 | Replace with fetch + progress in Phase 4 |
| `expo-haptics` | 11 | No-op |
| `expo-keep-awake` | 2 | No-op |
| `expo-screen-orientation` | 2 | No-op |
| `expo-intent-launcher` | 2 | No-op |
| `expo-navigation-bar` | 1 | No-op |
| `expo-brightness` | 2 | No-op |
| `expo-updates` | 4 | No-op (Tauri has its own updater) |

### Needs Platform-Specific Handling
| Package | Files | Strategy |
|---------|-------|---------|
| `expo-file-system` | 6 | Phase 1: skeleton stub. Phase 4: Tauri fs plugin |
| `expo-notifications` | 1 | Phase 5: Tauri notification plugin |
| `expo-document-picker` | 2 | HTML `<input type="file">` |
| `expo-clipboard` | 1 | `navigator.clipboard` API |
| `expo-sharing` | 2 | Web Share API |
| `expo-auth-session` | 2 | Tauri deep link plugin for OAuth |
| `expo-localization` | 1 | `navigator.language` |
| `expo-device` | 1 | `navigator.userAgent` parsing |
| `expo-crypto` | 1 | `crypto.subtle` API |
| `expo-constants` | 3 | Static config object |
| `expo-blur` | 19 | CSS `backdrop-filter` (same as @react-native-community/blur) |

---

## Implementation Phases

### Phase 0: Project Scaffolding
**Goal:** Tauri v2 project structure building and running with a hello-world React page.

#### Steps

0.1. **Install Tauri CLI and dependencies**
```bash
npm install --save-dev @tauri-apps/cli@^2
npm install @tauri-apps/api@^2
npm install --save-dev vite @vitejs/plugin-react vite-plugin-static-copy
```

0.2. **Create `vite.config.ts`** at project root

Key requirements:
- `react-native` -> `react-native-web` alias
- `.web.tsx` extension priority (so `.web.tsx` stubs resolve before `.tsx`)
- Reanimated Babel plugin via `@vitejs/plugin-react`
- `define: { global: 'globalThis' }` (RNW packages reference `global`)
- All native package aliases (see Phase 1 audit)
- Vite HTML entry pointing to `index.web.html`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['react-native-reanimated/plugin'],
      },
    }),
  ],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@': path.resolve(__dirname, './src'),
      // Native package stubs — see Phase 1 for complete list
    },
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  define: {
    global: 'globalThis',
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.web.html'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
```

0.3. **Create `index.web.html`** at project root
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nuvio</title>
    <style>html, body, #root { margin: 0; padding: 0; height: 100%; background: transparent; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.web.ts"></script>
  </body>
</html>
```

0.4. **Create `index.web.ts`** — web entry point
```typescript
import { AppRegistry } from 'react-native'
import App from './App'
AppRegistry.registerComponent('Nuvio', () => App)
AppRegistry.runApplication('Nuvio', { rootTag: document.getElementById('root') })
```

0.5. **Initialize Tauri** — scaffold `src-tauri/`
```bash
npx tauri init
```
Configure `src-tauri/tauri.conf.json`:
- `build.beforeDevCommand`: `npm run dev:web`
- `build.beforeBuildCommand`: `npm run build:web`
- `build.devUrl`: `http://localhost:1420`
- `build.frontendDist`: `../dist`
- `app.macOSPrivateApi`: `true` (required for transparent windows on macOS)
- `app.windows[0].transparent`: `true`
- `app.windows[0].width`: 1280, `height`: 800

0.6. **Add scripts to `package.json`**
```json
{
  "scripts": {
    "dev:web": "vite --config vite.config.ts",
    "build:web": "vite build --config vite.config.ts",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build",
    "setup:libs": "sh scripts/setup_libs_macos.sh"
  }
}
```

0.7. **Verify scaffolding** — `npm run dev:web` should start Vite on port 1420. The page will show errors (native modules not yet stubbed). That's expected — Phase 1 fixes this.

#### Acceptance Criteria
- [ ] `npm run dev:web` starts Vite dev server on port 1420
- [ ] `src-tauri/` directory exists with valid `tauri.conf.json` and `Cargo.toml`
- [ ] `npm run tauri:dev` compiles Rust and opens a native window (page content may error)
- [ ] Hot reload works when editing a simple test component

---

### Phase 1: Web Compatibility Layer
**Goal:** Get the full app rendering in the webview with stubs for all native-only modules. This is the largest phase and the foundation everything else depends on.

#### Step 1.1: Sentry Web Bridge (unblocks app root)

`App.tsx:328` exports `Sentry.wrap(App)` using `@sentry/react-native`. This wraps the entire app and must be resolved first.

**Option A (recommended):** Create `src/stubs/sentry.web.ts`:
```typescript
export const init = (_config: any) => {}
export const wrap = (component: any) => component
export const captureException = (_error: any) => {}
export const withScope = (_callback: any) => {}
export const feedbackIntegration = () => ({})
export default { init, wrap, captureException, withScope, feedbackIntegration }
```
Add to Vite aliases: `'@sentry/react-native': path.resolve(__dirname, 'src/stubs/sentry.web.ts')`

**Option B:** Replace with `@sentry/browser` for real error tracking on desktop.

#### Step 1.2: MMKV Web Bridge (unblocks storage)

The codebase uses `createMMKV()` (factory function), NOT `new MMKV()`. Both `mmkvStorage.ts` and `telemetryService.ts` import `createMMKV` from `react-native-mmkv`.

Create `src/stubs/mmkv.web.ts`:
```typescript
interface MMKVInstance {
  getString(key: string): string | undefined
  getNumber(key: string): number | undefined
  getBoolean(key: string): boolean | undefined
  set(key: string, value: string | number | boolean): void
  delete(key: string): void
  contains(key: string): boolean
  getAllKeys(): string[]
  clearAll(): void
}

export function createMMKV(config?: { id?: string }): MMKVInstance {
  const prefix = config?.id ?? 'default'
  return {
    getString: (key) => localStorage.getItem(`${prefix}:${key}`) ?? undefined,
    getNumber: (key) => { const v = localStorage.getItem(`${prefix}:${key}`); return v != null ? Number(v) : undefined },
    getBoolean: (key) => { const v = localStorage.getItem(`${prefix}:${key}`); return v != null ? v === 'true' : undefined },
    set: (key, value) => localStorage.setItem(`${prefix}:${key}`, String(value)),
    delete: (key) => localStorage.removeItem(`${prefix}:${key}`),
    contains: (key) => localStorage.getItem(`${prefix}:${key}`) !== null,
    getAllKeys: () => Object.keys(localStorage).filter(k => k.startsWith(`${prefix}:`)).map(k => k.slice(prefix.length + 1)),
    clearAll: () => { Object.keys(localStorage).filter(k => k.startsWith(`${prefix}:`)).forEach(k => localStorage.removeItem(k)) },
  }
}

// Also export MMKV class for any code using the constructor pattern
export class MMKV {
  private instance: MMKVInstance
  constructor(config?: { id?: string }) { this.instance = createMMKV(config) }
  getString(key: string) { return this.instance.getString(key) }
  getNumber(key: string) { return this.instance.getNumber(key) }
  getBoolean(key: string) { return this.instance.getBoolean(key) }
  set(key: string, value: string | number | boolean) { this.instance.set(key, value) }
  delete(key: string) { this.instance.delete(key) }
  contains(key: string) { return this.instance.contains(key) }
  getAllKeys() { return this.instance.getAllKeys() }
  clearAll() { this.instance.clearAll() }
}
```

**Note:** localStorage has a ~5-10MB limit. This is acceptable for Phase 1 testing. Phase 4 upgrades to `@tauri-apps/plugin-store` which persists to disk with no size limit.

#### Step 1.3: Complete Vite Alias Map

Add ALL native packages to `vite.config.ts` `resolve.alias`:

```typescript
// Packages with web equivalents
'@sentry/react-native': path.resolve(__dirname, 'src/stubs/sentry.web.ts'),
'react-native-mmkv': path.resolve(__dirname, 'src/stubs/mmkv.web.ts'),
'@d11/react-native-fast-image': path.resolve(__dirname, 'src/stubs/fast-image.web.tsx'),
'@shopify/flash-list': path.resolve(__dirname, 'src/stubs/flash-list.web.tsx'),
'@gorhom/bottom-sheet': path.resolve(__dirname, 'src/stubs/bottom-sheet.web.tsx'),
'@react-native-community/blur': path.resolve(__dirname, 'src/stubs/blur.web.tsx'),
'@react-native-community/slider': path.resolve(__dirname, 'src/stubs/slider.web.tsx'),
'react-native-image-colors': path.resolve(__dirname, 'src/stubs/image-colors.web.ts'),
'react-native-reanimated-carousel': path.resolve(__dirname, 'src/stubs/carousel.web.tsx'),
'react-native-wheel-color-picker': path.resolve(__dirname, 'src/stubs/color-picker.web.tsx'),
'react-native-markdown-display': path.resolve(__dirname, 'src/stubs/markdown.web.tsx'),
'@backpackapp-io/react-native-toast': path.resolve(__dirname, 'src/stubs/toast.web.ts'),
'@react-native-community/netinfo': path.resolve(__dirname, 'src/stubs/netinfo.web.ts'),
'posthog-react-native': path.resolve(__dirname, 'src/stubs/posthog.web.ts'),
'lottie-react-native': path.resolve(__dirname, 'src/stubs/lottie.web.tsx'),

// No-op stubs
'react-native-google-cast': path.resolve(__dirname, 'src/stubs/noop.ts'),
'@shopify/react-native-skia': path.resolve(__dirname, 'src/stubs/noop.ts'),
'react-native-immersive-mode': path.resolve(__dirname, 'src/stubs/noop.ts'),
'@adrianso/react-native-device-brightness': path.resolve(__dirname, 'src/stubs/noop.ts'),
'@kesha-antonov/react-native-background-downloader': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-haptics': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-keep-awake': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-screen-orientation': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-intent-launcher': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-navigation-bar': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-brightness': path.resolve(__dirname, 'src/stubs/noop.ts'),
'expo-updates': path.resolve(__dirname, 'src/stubs/noop.ts'),
```

Each stub must match the actual export surface used by the codebase. The `noop.ts` stub:
```typescript
export default {}
export const init = () => {}
export const configure = () => {}
export const activateKeepAwake = () => {}
export const deactivateKeepAwake = () => {}
export const lockAsync = () => Promise.resolve()
export const getLocales = () => [{ languageCode: 'en' }]
```

#### Step 1.4: Key Stubs Implementation

**`src/stubs/fast-image.web.tsx`** (53 files depend on this):
```tsx
import React from 'react'
import { Image, ImageProps } from 'react-native'

const FastImage = React.forwardRef((props: any, ref: any) => {
  const { source, resizeMode, ...rest } = props
  const src = typeof source === 'object' ? source.uri : source
  return <Image ref={ref} source={{ uri: src }} resizeMode={resizeMode} {...rest} />
})
FastImage.displayName = 'FastImage'

export default FastImage
export const priority = { low: 'low', normal: 'normal', high: 'high' }
export const resizeMode = { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
```

**`src/stubs/flash-list.web.tsx`** (4 core screens):
```tsx
import { FlatList } from 'react-native'
export const FlashList = FlatList
export const MasonryFlashList = FlatList
```

**`src/stubs/bottom-sheet.web.tsx`** (10 files):
```tsx
import React, { forwardRef, useImperativeHandle, useState } from 'react'
import { Modal, View, Pressable, ScrollView } from 'react-native'

export const BottomSheetModal = forwardRef(({ children, ...props }: any, ref: any) => {
  const [visible, setVisible] = useState(false)
  useImperativeHandle(ref, () => ({
    present: () => setVisible(true),
    dismiss: () => setVisible(false),
    close: () => setVisible(false),
  }))
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <Pressable style={{ flex: 1, justifyContent: 'flex-end' }} onPress={() => setVisible(false)}>
        <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' }}>
          {children}
        </View>
      </Pressable>
    </Modal>
  )
})
export const BottomSheetView = View
export const BottomSheetScrollView = ScrollView
export const BottomSheetBackdrop = () => null
export const BottomSheetModalProvider = ({ children }: any) => children
export default { BottomSheetModal, BottomSheetView, BottomSheetScrollView, BottomSheetBackdrop, BottomSheetModalProvider }
```

**`src/stubs/blur.web.tsx`** (5 files + expo-blur 19 files):
```tsx
import React from 'react'
import { View, ViewProps } from 'react-native'

export const BlurView = ({ style, intensity = 50, ...props }: ViewProps & { intensity?: number; tint?: string }) => (
  <View style={[style, { backdropFilter: `blur(${intensity / 5}px)`, WebkitBackdropFilter: `blur(${intensity / 5}px)` } as any]} {...props} />
)
export default BlurView
```

#### Step 1.5: Navigation Web Adaptation

`AppNavigator.tsx` is 1987 lines with `createNativeStackNavigator` (no web support), platform-branched bottom tabs, dynamic requires, and 92+ `Platform.OS` checks. This requires a dedicated web navigator.

**Create `src/navigation/AppNavigator.web.tsx`:**
- Import `createStackNavigator` from `@react-navigation/stack` (not native-stack)
- Copy the screen registration from the original (all 40+ screens)
- Replace the native bottom tabs with `@react-navigation/bottom-tabs` using a web-friendly custom tab bar
- Remove all iOS-specific code (glass effect, immersive mode, native tab bar dynamic requires)
- Use `NavigationContainer` with `linking` config for URL-based routing
- Remove `StatusBar` and `react-native-screens` calls (no-op or unavailable on web)

**Web tab bar component** — replace the blur/gradient native tab bar with CSS:
```tsx
const WebTabBar = ({ state, descriptors, navigation }) => (
  <div style={{ display: 'flex', borderTop: '1px solid #333', background: '#1a1a2e', padding: 8 }}>
    {state.routes.map((route, index) => { /* tab buttons */ })}
  </div>
)
```

**Key changes from native navigator:**
- `NativeStackNavigationOptions` -> `StackNavigationOptions`
- Remove `presentation: 'modal'` (use `cardStyle` instead)
- Remove `headerLargeTitle` and other iOS-specific options
- Animation: use `@react-navigation/stack` slide transitions instead of native

**Install web navigation deps:**
```bash
npm install @react-navigation/stack
```

#### Step 1.6: Expo Package Web Handling

Many Expo packages have built-in web support BUT only when using Expo's bundler. Under Vite, we need to ensure they resolve correctly:

- `expo-linear-gradient` (34 files): Has `.web.js` in its package. Vite's extension resolution should pick this up automatically IF the package exports are configured. Test early — if not, create a CSS gradient wrapper stub.
- `expo-blur` (19 files): Alias to same `blur.web.tsx` stub as `@react-native-community/blur`.
- `expo-file-system` (6 files): Skeleton stub for Phase 1, full Tauri fs in Phase 4.
- `expo-clipboard` (1 file): `navigator.clipboard.writeText()` / `readText()`.
- `expo-document-picker` (2 files): HTML `<input type="file">` wrapper.
- `expo-localization` (1 file): `{ getLocales: () => [{ languageCode: navigator.language.split('-')[0] }] }`.
- `expo-constants` (3 files): `{ expoConfig: { extra: {} }, executionEnvironment: 'bare' }`.

#### Step 1.7: Update `codecService.ts`

Add desktop codec matrix (line 28) and update platform detection (line 66):
```typescript
desktop: {
  h264: 'yes',    // MPV: hardware decode everywhere
  h265: 'yes',    // MPV: DXVA2 (Win) / VideoToolbox (Mac)
  vp9: 'yes',     // MPV: hardware where available, sw fallback
  av1: 'yes',     // MPV: hardware on newer GPUs, sw fallback
  xvid: 'yes',    // MPV: software decode
  mpeg2: 'yes',   // MPV: software decode
}

// Platform detection:
const platform = Platform.OS === 'web' ? 'desktop' : Platform.OS === 'ios' ? 'ios' : 'android';
```

#### Step 1.8: Platform Check Audit

The 103 files with `Platform.OS` checks mostly check for `'ios'` or `'android'` and fall through to defaults. However, **audit these specific danger spots** where the `else` branch assumes Android:
- `src/utils/playerSelection.ts` — if it returns the Android player path for non-iOS, web will try to load the Android native player. Must add `Platform.OS === 'web'` check.
- `src/services/updateService.ts` — Android-specific update logic in else branch.
- `src/services/codecService.ts` — already addressed in Step 1.7.
- Any file with `Platform.OS === 'ios' ? X : Y` pattern where Y is Android-specific.

#### Step 1.9: Test the web build

Iterative process — start Vite, fix import errors one at a time. Expected sequence:
1. First blocker will be `@sentry/react-native` (wraps App root) — fixed by Step 1.1
2. Next will be missing stubs — fixed by Steps 1.3-1.4
3. Then navigation errors — fixed by Step 1.5
4. Then runtime errors from Platform.OS assumptions — fixed by Step 1.8

#### Acceptance Criteria
- [ ] `npm run dev:web` renders the app shell in browser (http://localhost:1420)
- [ ] `npm run tauri:dev` renders the app in the Tauri window
- [ ] Navigation between Home, Library, Settings tabs works
- [ ] Zero crash-causing console errors (warnings acceptable)
- [ ] Settings screens render and persist values
- [ ] Catalog browsing works (TMDB API calls, image loading, metadata display)
- [ ] Search screen works
- [ ] i18n language switching works

---

### Phase 2: MPV Video Player Integration
**Goal:** Full video playback via MPV embedded in the Tauri window using soia-style `CAMetalLayer` render approach (not `--wid` embedding, which fails on macOS).

**Reference implementation:** [FengZeng/soia](https://github.com/FengZeng/soia)

#### Architecture

```
NSWindow (Tauri)
  +- NSView
       +- CAMetalLayer (MPV renders via mpv_render_context + Metal/MoltenVK) <- bottom
       +- WKWebView (React UI, transparent background) <- top
```

Key principle: **MPV never manages its own window.** A native helper library creates a `CAMetalLayer` sublayer inside the Tauri `NSView`, and MPV renders into it via `mpv_render_context`. The webview composites on top.

| Platform | Mode | Mechanism |
|----------|------|-----------|
| macOS | `CAMetalLayer` sublayer | `mpv_render_context` -> Metal via MoltenVK |
| Windows | HWND embedding | Standard `--wid` (works reliably on Windows) |

#### Steps

2.1. **Create the native helper library (`libnuvio_mpv`)**

Small C/Objective-C dylib (macOS) / DLL (Windows) that bridges MPV's render context to the platform's native window surface. Based on soia's `libsoia_utils`.

**macOS** (`src-tauri/native/macos/nuvio_mpv.m`):
- Takes `mpv_handle*` + `NSView*` pointer
- Creates `CAMetalLayer`, inserts as sublayer
- Calls `mpv_render_context_create()` pointing at that Metal layer
- Exposes C functions: `nuvio_mpv_create()`, `nuvio_mpv_render_update()`, `nuvio_mpv_resize()`, `nuvio_mpv_destroy()`

**Windows** (`src-tauri/native/windows/nuvio_mpv.c`):
- Standard HWND embedding via `--wid` (Windows doesn't need the render context workaround)
- Same C API for consistency

2.2. **Set up Rust FFI bindings** (`src-tauri/src/mpv/`)

```
src-tauri/src/mpv/
+-- mod.rs          # Re-exports
+-- ffi.rs          # extern "C" bindings to libmpv + libnuvio_mpv
+-- handle.rs       # MpvHandle: init, render loop thread, property observation
+-- event_loop.rs   # Dedicated thread: mpv_wait_event -> Tauri event emission
```

**Critical implementation details from soia:**
- Call `setlocale(LC_NUMERIC, "C")` before `mpv_create()` — libmpv breaks with locale-specific decimal separators
- Extract `NSView*` via `raw-window-handle`: `RawWindowHandle::AppKit(raw) => raw.ns_view.as_ptr()`
- Run a dedicated render thread at ~120fps (8ms sleep) calling `nuvio_mpv_render_update()`
- Use **physical pixels** (not logical) on macOS for render target sizing — prevents blurry video on Retina
- Re-sync `CAMetalLayer` frame on every `Resized` event
- Skip resize events when `ScaleFactorChanged` fires (macOS sends both, causing double-resize)
- **Render thread optimization**: use `mpv_render_context_set_update_callback` to wake the render thread on-demand instead of busy-polling at 120fps. This reduces CPU usage when video is paused.

2.3. **Add Rust dependencies** (`src-tauri/Cargo.toml`)
```toml
[dependencies]
tauri = { version = "2", features = ["macos-private-api"] }
raw-window-handle = "0.6"
libc = "0.2"
cfg-if = "1.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6"
objc2-app-kit = { version = "0.3", features = ["NSWindow", "NSView", "NSApplication"] }
objc2-foundation = "0.3"
objc2-quartz-core = "0.3"
block2 = "0.6"
```

2.4. **Configure `tauri.conf.json`**
```json
{
  "app": {
    "macOSPrivateApi": true,
    "windows": [{
      "label": "main",
      "title": "Nuvio",
      "width": 1280,
      "height": 720,
      "transparent": true,
      "decorations": true
    }]
  }
}
```

2.5. **Register Tauri commands** (`src-tauri/src/lib.rs`)

Commands exposed to frontend:
- `load_file(path, resume_pos)` — load media URL/path
- `mpv_command(args)` — generic MPV command pass-through
- `mpv_set_property(name, value)` — set any MPV property
- `mpv_get_property(name)` — get any MPV property
- `cycle_pause()` — toggle play/pause (with EOF-restart logic)
- `seek_video(position)` — absolute seek

Events emitted from Rust event loop:
- `mpv-progress-update` — `{ time_pos, duration, buffered_pos, is_playing, is_buffering }`
- `mpv-file-loaded` — `{ tracks: { audio: [...], subtitle: [...] } }`
- `mpv-end-file` — `{ reason: "eof" | "error" | "stop" }`
- `mpv-playback-restart` — after seek completes

2.6. **Bundle libmpv + helper libraries**

**macOS** (`scripts/setup_libs_macos.sh`):
1. Download prebuilt mpv + ffmpeg dylibs (pin to specific version, e.g., mpv 0.41.0)
2. Place all `.dylib` files in `src-tauri/libs/mpv/`
3. Normalize install names: `install_name_tool -id @rpath/<name>.dylib <file>`
4. Add `@loader_path` rpath to each
5. Bundle MoltenVK (Vulkan-over-Metal)
6. Generate `tauri.runtime.macos.json` listing all dylibs as `bundle.macOS.frameworks`
7. Ad-hoc sign: `codesign --sign - <each dylib>`

**Windows** (`scripts/setup_libs_windows.ps1`):
- Download prebuilt mpv + ffmpeg DLLs
- Place in `src-tauri/libs/mpv/`
- Declare as `bundle.resources` in `tauri.conf.json`

**Release bundling** (`scripts/bundle_libs_macos.sh`):
- Walk `libmpv.2.dylib` dependency tree via `otool -L`
- Copy all non-system transitive deps into `<App>.app/Contents/Frameworks/`
- Rewrite all paths to `@rpath/<name>` via `install_name_tool -change`
- Copy `MoltenVK_icd.json` to `Contents/Resources/vulkan/icd.d/`
- Sign all frameworks and app bundle

2.7. **MPV startup configuration**

Ported from Android `MPVView.kt` + soia's config:
```
hwdec = auto                          # DXVA2/D3D11VA (Win), VideoToolbox (Mac)
keep-open = yes
cache = auto
cache-pause = yes
demuxer-max-bytes = 67108864          # 64MB (matches Android config)
demuxer-max-back-bytes = 20971520     # 20MB
cache-secs = 30
demuxer-seekable-cache = yes
force-seekable = yes
target-prim = auto                    # HDR
target-trc = auto
tone-mapping = auto
hdr-compute-peak = auto
vd-lavc-o = strict=-2                 # DV Profile 5
sub-auto = fuzzy
sub-font-size = 48
sub-color = #FFFFFFFF
sub-border-size = 3
sub-border-color = #FF000000
sub-shadow-offset = 2
sub-shadow-color = #80000000
ytdl = yes                            # yt-dlp integration (desktop bonus)
ytdl-format = bv[height<=1080]+ba/b
```

2.8. **Create frontend player hook** (`src/components/player/desktop/hooks/useMpvPlayer.ts`)

Communicates with Rust via `invoke()` and `listen()`:
```typescript
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

const loadFile = (url: string, resumePos?: number) => invoke('load_file', { path: url, resumePos })
const seek = (pos: number) => invoke('seek_video', { position: pos })
const togglePause = () => invoke('cycle_pause')
const setVolume = (vol: number) => invoke('mpv_set_property', { name: 'volume', value: vol })
const setSpeed = (rate: number) => invoke('mpv_set_property', { name: 'speed', value: rate })
const setAudioTrack = (id: number) => invoke('mpv_set_property', { name: 'aid', value: id })
const setSubtitleTrack = (id: number) => invoke('mpv_set_property', { name: 'sid', value: id })
```

2.9. **Create desktop player component** (`src/components/player/desktop/DesktopPlayer.web.tsx`)

- Transparent div where MPV Metal layer shows through
- Overlays player controls (reuse existing control components)
- Non-interactive areas: `pointer-events: none`
- Interactive controls: `pointer-events: auto`

2.10. **Keyboard shortcut mapping** (replacing gesture controls)

| Mobile Gesture | Desktop Shortcut |
|----------------|-----------------|
| Double-tap left (rewind 10s) | Left arrow / J |
| Double-tap right (forward 10s) | Right arrow / L |
| Long-press (speed boost) | Hold Shift |
| Tap (toggle controls) | Mouse move / Space (play/pause) |
| Swipe up/down (volume) | Up/Down arrows |
| Pinch (zoom) | Z key (cycle resize modes) |
| N/A | K (toggle play/pause) |
| N/A | M (toggle mute) |
| N/A | F (toggle fullscreen) |
| N/A | Esc (exit fullscreen / close modal) |

2.11. **Wire subtitle styling** — port from `useCustomSubtitles`:
```typescript
await invoke('mpv_set_property', { name: 'sub-font-size', value: settings.subtitleFontSize })
await invoke('mpv_set_property', { name: 'sub-color', value: settings.subtitleTextColor })
// ... etc for all subtitle properties
```

2.12. **Wire audio track selection and playback speed**
- Audio: `mpv_set_property('aid', trackId)` — -1 to disable, 1+ for track index
- Speed: `mpv_set_property('speed', rate)` — 0.25 to 2.0

2.13. **Error handling**
- Wrap all `invoke()` calls in try/catch
- If MPV init fails, fall back to Shaka Player (Phase 3)
- If MPV crashes mid-playback, emit error event, show error modal, offer retry
- Log MPV errors to Sentry (when wired in Phase 1)

#### Acceptance Criteria
- [ ] Video plays in the Tauri window via MPV on Windows
- [ ] Video plays via MPV on macOS using CAMetalLayer approach
- [ ] All 6 codec types play correctly (H.264, HEVC, VP9, AV1, XviD, MPEG-2)
- [ ] Hardware acceleration active (verify via mpv stats overlay: Shift+I)
- [ ] SRT, VTT, and ASS/SSA subtitles render with user-configured styling
- [ ] Audio track switching works mid-playback
- [ ] Playback speed control works (0.25x-2x)
- [ ] Skip intro/outro buttons appear and work
- [ ] Watch progress saves and resume works
- [ ] Keyboard shortcuts functional
- [ ] MPV crash/error triggers graceful fallback

---

### Phase 3: Shaka Player Fallback
**Goal:** In-webview player for when MPV is unavailable or for simple HLS/DASH streams.

#### Steps

3.1. **Install dependencies**
```bash
npm install shaka-player jassub
```

3.2. **Configure jassub worker files** — copy WASM assets to public/ via `vite-plugin-static-copy` (already installed in Phase 0).

3.3. **Create `src/components/player/desktop/ShakaPlayer.web.tsx`**
- Lazy-import Shaka Player (`import('shaka-player/dist/shaka-player.compiled')`)
- Create `<video>` element, attach Shaka player
- Auto-detect HLS vs DASH from URL
- Wire up to existing player state hooks

3.4. **Create `src/components/player/desktop/SubtitleOverlay.web.tsx`**
- For ASS/SSA subtitles when using Shaka (MPV handles its own subtitles)
- Initialize jassub with canvas overlay
- Sync time from Shaka player's `timeupdate` events

3.5. **Player selection logic** (`src/components/player/desktop/hooks/useDesktopPlayerBridge.ts`)
- Check user preference (settings)
- Check MPV availability (try init, catch failure)
- Route to Shaka if MPV unavailable or user prefers web player
- Show codec warnings for Shaka limitations (no XviD/MPEG-2, limited HEVC on Windows)

#### Acceptance Criteria
- [ ] Shaka Player plays HLS streams in the webview
- [ ] Shaka Player plays DASH streams in the webview
- [ ] VTT subtitles render natively
- [ ] ASS/SSA subtitles render via jassub canvas overlay
- [ ] Player selection logic routes correctly
- [ ] User can switch between MPV and Shaka in settings
- [ ] Codec warnings displayed for Shaka-unsupported formats

---

### Phase 4: Desktop Storage & File System
**Goal:** Replace localStorage MMKV stub with persistent Tauri-native storage.

#### Steps

4.1. **Upgrade to Tauri Store**
```bash
npm install @tauri-apps/plugin-store
```
Update `src/stubs/mmkv.web.ts` to use `@tauri-apps/plugin-store` instead of localStorage. Tauri Store persists to disk as JSON with no size limit.

4.2. **Wire up Tauri file system**
```bash
npm install @tauri-apps/plugin-fs
```
Update `src/stubs/file-system.web.ts` with real implementations. Configure scoped file access in capabilities.

4.3. **Download manager** — replace background-downloader no-op with Tauri HTTP plugin or Rust-side download manager with progress events.

4.4. **Offline playback** — downloaded files play via MPV using local file paths.

#### Acceptance Criteria
- [ ] Settings persist across app restarts via Tauri Store
- [ ] Watch progress syncs correctly
- [ ] File downloads work with progress reporting
- [ ] Downloaded content plays offline via MPV

---

### Phase 5: Desktop Polish & Platform Features
**Goal:** Desktop-native UX features.

#### Steps

5.1. **System tray** — icon + context menu (Play/Pause, Next Episode, Quit)
5.2. **Native menus** — File, Playback, View, Help menus with keyboard shortcuts
5.3. **Window state persistence** — `tauri-plugin-window-state` saves/restores size and position
5.4. **Auto-updater** — `tauri-plugin-updater` with GitHub Releases as update source
5.5. **Deep links** — register `nuvio://` protocol for OAuth callbacks and external stream links
5.6. **Desktop notifications** — `tauri-plugin-notification` for download complete, sync status
5.7. **Fullscreen player** — F11/double-click to enter, Esc to exit, hide window chrome
5.8. **macOS Now Playing** — media keys + Control Center integration via `libnuvio_mpv` (soia pattern)
5.9. **Native PiP** — macOS `AVPictureInPictureController`, Windows CompactOverlay (via `libnuvio_mpv`)

#### Acceptance Criteria
- [ ] System tray icon with functional context menu
- [ ] Native menu bar with keyboard shortcuts
- [ ] Window position/size remembered across sessions
- [ ] Auto-updater detects and applies updates
- [ ] `nuvio://` deep links work
- [ ] Desktop notifications appear
- [ ] Fullscreen video with controls overlay
- [ ] Media keys control playback (macOS)

---

### Phase 6: Build, Testing & Distribution
**Goal:** CI/CD pipeline, automated tests, and signed desktop binaries.

#### Steps

6.1. **macOS build** — code signing, DMG packaging, notarization, universal binary (x86_64 + aarch64)

6.2. **Windows build** — NSIS installer, optional code signing, WebView2 bootstrapper included

6.3. **GitHub Actions CI**
```yaml
# .github/workflows/desktop-build.yml
# Matrix: [macos-latest, windows-latest]
# Steps: checkout, setup-rust, setup-node, setup:libs, npm install, tauri build
# Artifacts: upload .dmg and .msi to GitHub Releases
```

6.4. **Auto-update infrastructure** — `tauri-plugin-updater` checks GitHub Releases `latest.json` manifest

6.5. **Library version pinning** — Pin `libmpv` to specific version (e.g., 0.41.0) in setup scripts. Download from a controlled release source (fork or mirror), not `brew` (which may update unexpectedly).

#### Testing Strategy

**Unit tests:**
- All web stubs have tests verifying they export the correct API surface
- MMKV web stub: test get/set/delete/clearAll round-trips
- Codec service: test desktop codec matrix returns correct values

**Integration tests:**
- Tauri command bridge: test `invoke()` round-trips for MPV commands
- Storage: test Tauri Store persistence across app restarts
- Navigation: test screen routing on web

**E2E tests (manual for now, automate later):**
- [ ] App launches, navigates tabs, displays catalog
- [ ] Play HLS stream — video + audio work, controls respond
- [ ] Play each codec type (H.264, HEVC, VP9, AV1, XviD, MPEG-2)
- [ ] Load SRT, VTT, ASS subtitles — correct styling
- [ ] Switch audio tracks mid-playback
- [ ] Change playback speed
- [ ] Close mid-playback, reopen — resume prompt appears
- [ ] Trakt/Simkl scrobble works
- [ ] Settings persist across restart
- [ ] Build v0.1 then v0.2 — auto-updater works

#### Acceptance Criteria
- [ ] `npm run tauri:build` produces working .app (macOS) and .exe (Windows)
- [ ] macOS app signed and notarized
- [ ] Windows installer includes WebView2 bootstrapper
- [ ] CI builds on push to release branch
- [ ] Auto-updater detects and applies updates
- [ ] All unit tests pass
- [ ] All E2E smoke tests pass

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Native helper library (`libnuvio_mpv`) ObjC/Metal integration complexity | Medium | High | Reference soia's `libsoia_utils` directly — proven pattern, copy the CAMetalLayer approach |
| WebKit/WebView2 rendering differences break UI | Medium | Medium | Test on both platforms early; use CSS feature detection; keep layout simple |
| react-native-web incompatibility with some RN components | Medium | Medium | Create `.web.tsx` overrides; test RNW 0.21.2 with RN 0.81.4 early, upgrade if needed |
| Tauri transparent window flickering | Medium | Medium | Known issue (tauri-apps/tauri#9220); test workarounds, may need solid background with video region cutout |
| react-native-reanimated web edge cases | Medium | Low | Most animations are simple; complex worklet animations may need `.web.tsx` overrides |
| expo-linear-gradient not resolving under Vite | Medium | Medium | Test early; create CSS gradient stub if Expo web shim doesn't work under Vite |
| OAuth redirect handling on desktop | Medium | Medium | Register `nuvio://` protocol via deep link plugin; test auth flows in Phase 1 |
| localStorage 5MB limit during Phase 1 | Low | Low | Acceptable for dev/testing; Phase 4 upgrades to Tauri Store |
| axios-cookiejar-support doesn't work in webview | Low | Medium | Test early; may need to remove cookie jar or use Tauri HTTP plugin |
| libmpv binary size increases app bundle | Low | Low | MPV + deps ~30-50MB; acceptable for desktop |

---

## Verification Steps

1. **Smoke test (per platform):** App launches, navigates tabs, displays catalog data
2. **Playback test:** Play an HLS stream with H.264 — video and audio work
3. **Codec test:** Each codec (H.264, HEVC, VP9, AV1, XviD, MPEG-2) plays or shows warning
4. **Subtitle test:** SRT, VTT, and ASS subtitles render with correct styling
5. **Audio track test:** Switch tracks mid-playback — audio changes, video continues
6. **Speed test:** Change speed — audio pitch adjusts, video speed changes
7. **Resume test:** Close mid-playback, reopen — resume prompt with correct position
8. **Sync test:** Watch content, verify Trakt/Simkl scrobble, Supabase sync
9. **Settings test:** Change settings — all persist across restart
10. **Update test:** Build v0.1 then v0.2 — auto-updater works

---

## Estimated Scope

| Phase | Files Changed/Created | Complexity |
|-------|----------------------|------------|
| Phase 0: Scaffolding | ~8 new files | Low |
| Phase 1: Web Compatibility | ~25-35 new/modified files (stubs + navigator + configs) | High (largest phase, most debugging) |
| Phase 2: MPV Integration | ~15-20 new files (Rust mpv/, platform/, native helper, scripts) | High (Rust FFI + ObjC native helper + Metal rendering + dylib bundling) |
| Phase 3: Shaka Fallback | ~5-8 new files | Medium |
| Phase 4: Storage & FS | ~4-6 modified files | Medium |
| Phase 5: Desktop Polish | ~6-10 new files | Medium |
| Phase 6: Build, Test & CI | ~5-8 new files | Medium |

**Critical path:** Phase 0 -> Phase 1 -> Phase 2 (MPV). Phases 3-5 can partially parallel after Phase 2.

**Highest risk item:** The native helper library (`libnuvio_mpv`) — writing ObjC that creates a `CAMetalLayer` and wires it to `mpv_render_context`. Soia's `libsoia_utils` proves this works, so use it as direct reference. Validate early in Phase 2 by getting a single video playing in the Tauri window on macOS before building out the full command surface.

**Second highest risk:** Phase 1 web compatibility. The sheer number of native packages (46 identified) means expect a multi-day iterative debug cycle. Start Vite, fix the first error, repeat. The stub audit above should prevent most surprises, but edge cases will surface.
