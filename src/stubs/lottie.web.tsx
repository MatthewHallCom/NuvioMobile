// lottie-react-native web stub. Used in 5 files.
// Falls back to a simple animated placeholder.
import React from 'react';
import { View } from 'react-native';

interface LottieViewProps {
  source: any;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  style?: any;
  onAnimationFinish?: () => void;
  [key: string]: any;
}

const LottieView = React.forwardRef<any, LottieViewProps>(
  ({ style, source, children, ...props }, ref) => (
    <View ref={ref} style={style} />
  ),
);
LottieView.displayName = 'LottieView';

export default LottieView;
