import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme/theme-context";
import { radius } from "@/theme/tokens";

export type SurfaceProps = {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    tone?: "surface" | "alt" | "chrome";
    cornerRadius?: number;
    bordered?: boolean;
};

export function Surface({
    children,
    style,
    tone = "surface",
    cornerRadius = radius.md,
    bordered = true,
}: SurfaceProps) {
    const { colors } = useTheme();
    const background =
        tone === "chrome"
            ? colors.chrome
            : tone === "alt"
              ? colors.surfaceAlt
              : colors.surface;

    return (
        <View
            style={[
                { backgroundColor: background, borderRadius: cornerRadius },
                bordered && {
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}
