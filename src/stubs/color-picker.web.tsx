// react-native-wheel-color-picker web stub. Used in 1 file.
import React from 'react';
import { View } from 'react-native';

interface ColorPickerProps {
  color?: string;
  onColorChange?: (color: string) => void;
  onColorChangeComplete?: (color: string) => void;
  thumbSize?: number;
  sliderSize?: number;
  noSnap?: boolean;
  row?: boolean;
  swatches?: boolean;
  discrete?: boolean;
  style?: any;
}

const ColorPicker = ({ color = '#ffffff', onColorChange, onColorChangeComplete, style }: ColorPickerProps) => (
  <View style={[{ padding: 8 }, style]}>
    <input
      type="color"
      value={color}
      onChange={(e) => onColorChange?.(e.target.value)}
      onBlur={(e) => onColorChangeComplete?.((e.target as HTMLInputElement).value)}
      style={{ width: '100%', height: 40, cursor: 'pointer', border: 'none', background: 'transparent' }}
    />
  </View>
);

export default ColorPicker;
