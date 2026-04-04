// react-native-image-colors web stub.
// Returns default colors. Used in 1 file (useDominantColor.ts).

interface ImageColors {
  dominant?: string;
  vibrant?: string;
  darkVibrant?: string;
  lightVibrant?: string;
  darkMuted?: string;
  lightMuted?: string;
  muted?: string;
  average?: string;
  background?: string;
  detail?: string;
  primary?: string;
  secondary?: string;
  platform?: string;
}

export const getColors = async (_uri: string, _config?: any): Promise<ImageColors> => ({
  dominant: '#1a1a2e',
  vibrant: '#4a90d9',
  darkVibrant: '#2c5282',
  lightVibrant: '#63b3ed',
  darkMuted: '#2d3748',
  lightMuted: '#a0aec0',
  muted: '#718096',
  average: '#2d3748',
  background: '#1a1a2e',
  primary: '#4a90d9',
  secondary: '#2d3748',
  platform: 'web',
});

export default { getColors };
