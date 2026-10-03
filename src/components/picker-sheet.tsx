import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/theme-context';
import { radius, space, typeScale } from '@/theme/tokens';

import { Surface } from './surface';

export type PickerOption = {
  key: string;
  label: string;
  selected?: boolean;
  destructive?: boolean;
};

export type PickerSheetProps = {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
};

export function PickerSheet({ visible, title, options, onSelect, onClose }: PickerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheetWrap, { paddingBottom: insets.bottom + space.lg }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Surface style={styles.sheet} cornerRadius={radius.lg}>
            <View style={styles.head}>
              <Text style={[typeScale.heading, { color: colors.text }]}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={styles.list} bounces={false}>
              {options.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => onSelect(option.key)}
                  style={({ pressed }) => [
                    styles.option,
                    { borderBottomColor: colors.divider, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
                  ]}
                >
                  <Text
                    style={[
                      typeScale.body,
                      { color: option.destructive ? colors.danger : colors.text },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {option.selected ? (
                    <Ionicons name="checkmark" size={18} color={colors.accent} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Surface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  sheetWrap: {
    paddingHorizontal: space.lg,
  },
  sheet: {
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  list: {
    maxHeight: 360,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
