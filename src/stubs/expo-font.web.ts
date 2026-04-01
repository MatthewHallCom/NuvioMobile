// expo-font web stub.
// Used by @expo/vector-icons for font loading checks.

export const isLoaded = (_fontFamily: string) => true;
export const isLoading = (_fontFamily: string) => false;
export const loadAsync = (_fonts: any) => Promise.resolve();
export const useFonts = (_fonts: any) => [true, null];
export const Font = { isLoaded, isLoading, loadAsync };

export default Font;
