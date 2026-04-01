import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const extensions = [
  '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
  '.tsx', '.ts', '.jsx', '.js', '.json',
];

export default defineConfig(({ mode }) => {
  // Load all env vars (including EXPO_PUBLIC_*) from .env files
  const env = loadEnv(mode, process.cwd(), ['EXPO_PUBLIC_', 'VITE_']);

  // Build process.env.EXPO_PUBLIC_* replacements for define
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('EXPO_PUBLIC_')) {
      envDefine[`process.env.${key}`] = JSON.stringify(value);
    }
  }

  return {
  plugins: [
    react({
      babel: {
        plugins: ['react-native-reanimated/plugin'],
      },
    }),
  ],

  resolve: {
    extensions,
    alias: {
      // Core RN -> RNW
      'react-native': 'react-native-web',

      // Path alias
      '@': path.resolve(__dirname, './src'),

      // List component that imports unstable_batchedUpdates
      '@legendapp/list': path.resolve(__dirname, 'src/stubs/flash-list.web.tsx'),

      // --- Packages with web stubs ---
      '@sentry/react-native': path.resolve(__dirname, 'src/stubs/sentry.web.ts'),
      'react-native-mmkv': path.resolve(__dirname, 'src/stubs/mmkv.web.ts'),
      '@d11/react-native-fast-image': path.resolve(__dirname, 'src/stubs/fast-image.web.tsx'),
      '@shopify/flash-list': path.resolve(__dirname, 'src/stubs/flash-list.web.tsx'),
      '@gorhom/bottom-sheet': path.resolve(__dirname, 'src/stubs/bottom-sheet.web.tsx'),
      '@react-native-community/blur': path.resolve(__dirname, 'src/stubs/blur.web.tsx'),
      'expo-blur': path.resolve(__dirname, 'src/stubs/blur.web.tsx'),
      '@react-native-community/slider': path.resolve(__dirname, 'src/stubs/slider.web.tsx'),
      'react-native-image-colors': path.resolve(__dirname, 'src/stubs/image-colors.web.ts'),
      'react-native-reanimated-carousel': path.resolve(__dirname, 'src/stubs/carousel.web.tsx'),
      'react-native-wheel-color-picker': path.resolve(__dirname, 'src/stubs/color-picker.web.tsx'),
      'react-native-markdown-display': path.resolve(__dirname, 'src/stubs/markdown.web.tsx'),
      '@backpackapp-io/react-native-toast': path.resolve(__dirname, 'src/stubs/toast.web.ts'),
      '@react-native-community/netinfo': path.resolve(__dirname, 'src/stubs/netinfo.web.ts'),
      'posthog-react-native': path.resolve(__dirname, 'src/stubs/posthog.web.ts'),
      'lottie-react-native': path.resolve(__dirname, 'src/stubs/lottie.web.tsx'),
      'expo-file-system/legacy': path.resolve(__dirname, 'src/stubs/file-system.web.ts'),
      'expo-file-system': path.resolve(__dirname, 'src/stubs/file-system.web.ts'),
      'react-native-cheerio': 'cheerio-without-node-native',

      // --- Deep RN internal imports ---
      'react-native/Libraries/Utilities/codegenNativeComponent': path.resolve(__dirname, 'src/stubs/codegenNativeComponent.web.ts'),

      // --- Native-only packages ---
      'react-native-bottom-tabs': path.resolve(__dirname, 'src/stubs/noop.ts'),
      '@bottom-tabs/react-navigation': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'react-native-worklets/package.json': path.resolve(__dirname, 'src/stubs/package-stub.json'),
      'react-native-google-cast': path.resolve(__dirname, 'src/stubs/noop.ts'),
      '@shopify/react-native-skia': path.resolve(__dirname, 'src/stubs/skia.web.ts'),
      'react-native-immersive-mode': path.resolve(__dirname, 'src/stubs/noop.ts'),
      '@adrianso/react-native-device-brightness': path.resolve(__dirname, 'src/stubs/noop.ts'),
      '@kesha-antonov/react-native-background-downloader': path.resolve(__dirname, 'src/stubs/background-downloader.web.ts'),
      'expo-haptics': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-keep-awake': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-screen-orientation': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-intent-launcher': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-navigation-bar': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-brightness': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-font': path.resolve(__dirname, 'src/stubs/expo-font.web.ts'),
      'expo-constants': path.resolve(__dirname, 'src/stubs/expo-constants.web.ts'),
      'expo-modules-core': path.resolve(__dirname, 'src/stubs/expo-modules-core.web.ts'),
      'expo-status-bar': path.resolve(__dirname, 'src/stubs/status-bar.web.ts'),
      'expo-updates': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-glass-effect': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'react-native-boost': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'react-native-nitro-modules': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'react-native-worklets': path.resolve(__dirname, 'src/stubs/worklets.web.ts'),
      'expo-live-activity': path.resolve(__dirname, 'src/stubs/noop.ts'),
      'expo-random': path.resolve(__dirname, 'src/stubs/noop.ts'),
    },
  },

  define: {
    global: 'globalThis',
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    ...envDefine,
  },

  build: {
    target: 'es2022',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      // shimMissingExports: Rolldown creates undefined shims for missing exports
      // instead of erroring. This is critical for RN packages that import
      // native-only APIs (requireNativeComponent, NativeModules, etc.) from
      // react-native, which is aliased to react-native-web.
      shimMissingExports: true,
      moduleTypes: {
        '.js': 'jsx',
        '.mjs': 'jsx',
      },
    },
  },

  // Expose EXPO_PUBLIC_* env vars to the client (Expo convention)
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', '**/ios/**', '**/android/**'],
    },
  },

  optimizeDeps: {
    include: [
      'react-native-web',
      '@expo/vector-icons',
      'expo-linear-gradient',
      'react-native-vector-icons',
      'react-native-paper',
      'react-native-safe-area-context',
      'react-native-gesture-handler',
      'react-native-screens',
      'react-native-svg',
    ],
    rolldownOptions: {
      shimMissingExports: true,
      moduleTypes: {
        '.js': 'jsx',
        '.mjs': 'jsx',
      },
      resolve: {
        extensions,
      },
    },
  },
};
});
