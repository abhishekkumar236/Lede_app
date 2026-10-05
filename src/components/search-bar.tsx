import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { useTheme } from "@/theme/theme-context";
import { radius, space, typeScale } from "@/theme/tokens";

export type SearchBarProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

export function SearchBar({
    value,
    onChange,
    placeholder = "Search",
}: SearchBarProps) {
    const { colors } = useTheme();

    return (
        <View
            style={[
                styles.wrap,
                {
                    backgroundColor: colors.surfaceAlt,
                    borderColor: colors.border,
                },
            ]}
        >
            <Ionicons name="search" size={15} color={colors.textFaint} />
            <TextInput
                value={value}
                onChangeText={onChange}
                placeholder={placeholder}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={[typeScale.body, styles.input, { color: colors.text }]}
            />
            {value.length > 0 ? (
                <Pressable onPress={() => onChange("")} hitSlop={8}>
                    <Ionicons
                        name="close-circle"
                        size={17}
                        color={colors.textFaint}
                    />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radius.sm + 2,
        borderWidth: StyleSheet.hairlineWidth,
    },
    input: {
        flex: 1,
        paddingVertical: space.sm + 2,
    },
});
