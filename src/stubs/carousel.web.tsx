// react-native-reanimated-carousel web stub.
// Used in 1 file. Falls back to a simple horizontal ScrollView.
import React from 'react';
import { ScrollView, View, Dimensions } from 'react-native';

interface CarouselProps {
  data: any[];
  renderItem: (info: { item: any; index: number; animationValue?: any }) => React.ReactElement;
  width?: number;
  height?: number;
  loop?: boolean;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  scrollAnimationDuration?: number;
  style?: any;
  onSnapToItem?: (index: number) => void;
  mode?: string;
  [key: string]: any;
}

const Carousel = React.forwardRef<any, CarouselProps>(
  ({ data, renderItem, width, height = 200, style, ...rest }, ref) => {
    const itemWidth = width ?? Dimensions.get('window').width;
    return (
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={[{ height }, style]}
      >
        {data?.map((item, index) => (
          <View key={index} style={{ width: itemWidth, height }}>
            {renderItem({ item, index })}
          </View>
        ))}
      </ScrollView>
    );
  },
);
Carousel.displayName = 'Carousel';

export const Pagination = (_props: any) => null;

export default Carousel;
