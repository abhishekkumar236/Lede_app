import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/theme/theme-context';
import { radius, space, typeScale } from '@/theme/tokens';

export type ChipProps = {
  label: string;
  onPress?: () => void;
  active?: boolean;
  tone?: 'default' | 'accent';
};

export function Chip({ label, onPress, active = false, tone = 'default' }: ChipProps) {
  const { colors } = useTheme();

  const background = active
    ? tone === 'accent'
      ? colors.accent
      : colors.inverse
    : colors.surfaceAlt;
  const foreground = active ? (tone === 'accent' ? '#FFFFFF' : colors.onInverse) : colors.textMuted;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: background,
          borderColor: active ? 'transparent' : colors.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[typeScale.caption, { color: foreground }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
