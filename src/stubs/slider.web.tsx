// Slider web stub — HTML input[type=range].
// @react-native-community/slider is used in 2 files.
import React from 'react';
import { View } from 'react-native';

interface SliderProps {
  value?: number;
  minimumValue?: number;
  maximumValue?: number;
  step?: number;
  onValueChange?: (value: number) => void;
  onSlidingStart?: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  disabled?: boolean;
  style?: any;
}

const Slider = ({
  value = 0,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  onValueChange,
  onSlidingStart,
  onSlidingComplete,
  minimumTrackTintColor = '#007AFF',
  maximumTrackTintColor = '#B0B0B0',
  thumbTintColor,
  disabled = false,
  style,
}: SliderProps) => (
  <View style={style}>
    <input
      type="range"
      value={value}
      min={minimumValue}
      max={maximumValue}
      step={step || 'any'}
      disabled={disabled}
      onChange={(e) => onValueChange?.(Number(e.target.value))}
      onMouseDown={() => onSlidingStart?.(value)}
      onMouseUp={(e) => onSlidingComplete?.(Number((e.target as HTMLInputElement).value))}
      style={{
        width: '100%',
        accentColor: minimumTrackTintColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    />
  </View>
);

export default Slider;
