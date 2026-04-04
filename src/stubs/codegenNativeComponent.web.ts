// Stub for react-native/Libraries/Utilities/codegenNativeComponent
// Used by native-only packages like react-native-bottom-tabs.
// Returns a no-op component since native views don't exist on web.
import { View } from 'react-native';

export default function codegenNativeComponent(_name: string, _options?: any) {
  return View;
}
