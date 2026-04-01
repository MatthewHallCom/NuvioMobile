// expo-status-bar web stub.
// StatusBar is a no-op on web — there's no native status bar to control.

export type StatusBarStyle = 'auto' | 'inverted' | 'light' | 'dark';
export type StatusBarAnimation = 'none' | 'fade' | 'slide';
export type StatusBarProps = {
  style?: StatusBarStyle;
  animated?: boolean;
  hidden?: boolean;
  backgroundColor?: string;
  translucent?: boolean;
  networkActivityIndicatorVisible?: boolean;
};

export function setStatusBarStyle(_style: StatusBarStyle, _animated?: boolean) {}
export function setStatusBarHidden(_hidden: boolean, _animation?: StatusBarAnimation) {}
export function setStatusBarBackgroundColor(_color: string, _animated?: boolean) {}
export function setStatusBarTranslucent(_translucent: boolean) {}
export function setStatusBarNetworkActivityIndicatorVisible(_visible: boolean) {}

export const StatusBar = (_props: StatusBarProps) => null;
export default StatusBar;
