// BottomSheet web stub — modal-based replacement.
// @gorhom/bottom-sheet is used in 10 files.
import React, { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { Modal, View, Pressable, ScrollView, StyleSheet } from 'react-native';

export const BottomSheetModal = forwardRef<any, any>(({ children, snapPoints, onChange, ...props }, ref) => {
  const [visible, setVisible] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => setVisible(true),
    dismiss: () => setVisible(false),
    close: () => setVisible(false),
    snapToIndex: () => {},
    snapToPosition: () => {},
    expand: () => setVisible(true),
    collapse: () => setVisible(false),
    forceClose: () => setVisible(false),
  }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
});
BottomSheetModal.displayName = 'BottomSheetModal';

export const BottomSheet = BottomSheetModal;
export const BottomSheetView = View;
export const BottomSheetScrollView = ScrollView;
export const BottomSheetFlatList = ({ data, renderItem, keyExtractor, ...props }: any) => (
  <ScrollView {...props}>
    {data?.map((item: any, index: number) => (
      <React.Fragment key={keyExtractor ? keyExtractor(item, index) : index}>
        {renderItem({ item, index })}
      </React.Fragment>
    ))}
  </ScrollView>
);
export const BottomSheetTextInput = (props: any) => <input {...props} />;
export const BottomSheetBackdrop = () => null;
export const BottomSheetModalProvider = ({ children }: any) => <>{children}</>;
export const useBottomSheet = () => ({ close: () => {}, snapToIndex: () => {}, expand: () => {} });
export const useBottomSheetModal = () => ({ dismiss: () => {}, dismissAll: () => {} });

export default BottomSheet;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    paddingBottom: 20,
  },
});
