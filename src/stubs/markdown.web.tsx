// react-native-markdown-display web stub. Used in 1 file.
import React from 'react';
import { Text, View } from 'react-native';

const Markdown = ({ children, style, ...props }: any) => (
  <View style={style}>
    <Text style={{ color: '#fff' }}>{typeof children === 'string' ? children : ''}</Text>
  </View>
);

export default Markdown;
