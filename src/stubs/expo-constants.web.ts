// expo-constants web stub.
// Used in simklService.ts and HeroSection.tsx.

export const ExecutionEnvironment = {
  Bare: 'bare',
  Standalone: 'standalone',
  StoreClient: 'storeClient',
};

const Constants = {
  appOwnership: null,
  expoConfig: {
    name: 'Nuvio',
    slug: 'nuvio',
    version: '0.6.0',
    extra: {},
  },
  expoGoConfig: null,
  expoRuntimeVersion: null,
  executionEnvironment: ExecutionEnvironment.Bare,
  experienceUrl: '',
  getWebViewUserAgentAsync: () => Promise.resolve(navigator.userAgent),
  installationId: '',
  isDevice: true,
  isHeadless: false,
  manifest: null,
  manifest2: null,
  sessionId: '',
  statusBarHeight: 0,
  systemFonts: [],
  platform: { web: {} },
  deviceName: 'Desktop',
};

export default Constants;
