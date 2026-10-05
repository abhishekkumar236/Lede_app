import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme/theme-context";
import { typeScale } from "@/theme/tokens";

export default function TabsLayout() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: colors.base },
                tabBarActiveTintColor: colors.text,
                tabBarInactiveTintColor: colors.textFaint,
                tabBarLabelStyle: [typeScale.micro, styles.label],
                tabBarIconStyle: styles.icon,
                tabBarStyle: [
                    styles.bar,
                    {
                        backgroundColor: colors.chrome,
                        borderTopColor: colors.divider,
                        height: 60 + insets.bottom,
                        paddingBottom: insets.bottom + 6,
                    },
                ],
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: "LATEST",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="reader-outline"
                            size={size - 3}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="saved"
                options={{
                    title: "SAVED",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="bookmark-outline"
                            size={size - 3}
                            color={color}
                        />
                    ),
                }}
            />
            <Tabs.Screen
                name="feeds"
                options={{
                    title: "FEEDS",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons
                            name="albums-outline"
                            size={size - 3}
                            color={color}
                        />
                    ),
                }}
            />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    bar: {
        position: "absolute",
        borderTopWidth: StyleSheet.hairlineWidth,
        elevation: 0,
        paddingTop: 8,
    },
    label: {
        marginTop: 2,
    },
    icon: {
        marginTop: 2,
    },
});
