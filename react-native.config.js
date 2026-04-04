const isCatalyst = process.env.CATALYST === '1';

module.exports = {
  dependencies: {
    'expo-libvlc-player': {
      platforms: {
        ios: null,
      },
    },
    'react-native-vlc-media-player': {
      platforms: {
        ios: null,
      },
    },
    // Conditionally disable modules incompatible with Mac Catalyst
    ...(isCatalyst
      ? {
          // Google Cast SDK has no Catalyst headers
          'react-native-google-cast': {
            platforms: {
              ios: null,
            },
          },
          // Skia macOS libs are tagged macOS, not macCatalyst
          '@shopify/react-native-skia': {
            platforms: {
              ios: null,
            },
          },
        }
      : {}),
  },
};
