// @shopify/react-native-skia web stub.
// Used in 1 file. Exports the Skia drawing primitives as no-op components.
const NoopComponent = () => null;

export const Canvas = NoopComponent;
export const Circle = NoopComponent;
export const Blur = NoopComponent;
export const BlurMask = NoopComponent;
export const Group = NoopComponent;
export const Path = NoopComponent;
export const Rect = NoopComponent;
export const RoundedRect = NoopComponent;
export const Line = NoopComponent;
export const Image = NoopComponent;
export const Text = NoopComponent;
export const Fill = NoopComponent;
export const LinearGradient = NoopComponent;
export const RadialGradient = NoopComponent;
export const Shadow = NoopComponent;
export const useFont = () => null;
export const useImage = () => null;
export const usePathValue = () => ({ current: null });
export const Skia = {};
export const vec = (x = 0, y = 0) => ({ x, y });
export const interpolate = (value: number, _input: number[], _output: number[]) => value;
export const interpolateColors = (value: number, _input: number[], _output: string[]) => '#000000';
export const Extrapolate = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };

export default { Canvas, Circle, Blur, BlurMask, Group, Path, Rect };
