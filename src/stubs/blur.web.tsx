// Blur web stub — uses CSS backdrop-filter.
// Covers both @react-native-community/blur (5 files) and expo-blur (19 files).
import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';

interface BlurViewProps extends ViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default' | 'extraLight' | 'regular' | 'prominent';
  blurType?: string;
  blurAmount?: number;
  blurRadius?: number;
  reducedTransparencyFallbackColor?: string;
  experimentalBlurMethod?: string;
}

export const BlurView = React.forwardRef<any, BlurViewProps>(
  ({ style, intensity = 50, blurAmount, blurRadius, tint = 'dark', children, ...props }, ref) => {
    const blur = blurAmount ?? blurRadius ?? intensity / 5;
    const bgColor = tint === 'light' ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';

    return (
      <View
        ref={ref}
        style={[
          style,
          {
            backdropFilter: `blur(${blur}px)`,
            // @ts-ignore — WebkitBackdropFilter for Safari
            WebkitBackdropFilter: `blur(${blur}px)`,
            backgroundColor: bgColor,
          },
        ]}
        {...props}
      >
        {children}
      </View>
    );
  },
);
BlurView.displayName = 'BlurView';

export default BlurView;
