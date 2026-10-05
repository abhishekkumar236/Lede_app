export const palette = {
    light: {
        base: "#FAF9F7",
        surface: "#FFFFFF",
        surfaceAlt: "#F1F0ED",
        chrome: "rgba(250, 249, 247, 0.94)",
        text: "#17171A",
        textMuted: "#6B6B74",
        textFaint: "#9B9BA4",
        divider: "rgba(23, 23, 26, 0.08)",
        border: "rgba(23, 23, 26, 0.10)",
        accent: "#2F6BE4",
        accentSoft: "rgba(47, 107, 228, 0.10)",
        inverse: "#17171A",
        onInverse: "#FAF9F7",
        danger: "#C0392B",
    },
    dark: {
        base: "#0D0D0F",
        surface: "#161619",
        surfaceAlt: "#1F1F24",
        chrome: "rgba(13, 13, 15, 0.94)",
        text: "#F3F3F5",
        textMuted: "#A0A0A9",
        textFaint: "#70707A",
        divider: "rgba(255, 255, 255, 0.08)",
        border: "rgba(255, 255, 255, 0.11)",
        accent: "#7AA2FF",
        accentSoft: "rgba(122, 162, 255, 0.14)",
        inverse: "#F3F3F5",
        onInverse: "#17171A",
        danger: "#F0705F",
    },
} as const;

export type ColorName = keyof typeof palette.light;
export type Palette = Record<ColorName, string>;

export const space = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    xxl: 40,
} as const;

export const radius = {
    sm: 8,
    md: 14,
    lg: 20,
    pill: 999,
} as const;

export const typeScale = {
    display: {
        fontSize: 32,
        lineHeight: 38,
        fontWeight: "700",
        letterSpacing: -0.6,
    },
    title: {
        fontSize: 22,
        lineHeight: 28,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    heading: {
        fontSize: 17,
        lineHeight: 23,
        fontWeight: "600",
        letterSpacing: -0.2,
    },
    body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
    label: {
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "600",
        letterSpacing: -0.1,
    },
    caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
    micro: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: "600",
        letterSpacing: 0.7,
    },
} as const;
