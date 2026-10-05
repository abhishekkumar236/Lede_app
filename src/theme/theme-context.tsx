import { useSQLiteContext } from "expo-sqlite";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { getSetting, setSetting } from "@/db/settings";

import { palette, type Palette } from "./tokens";

export type ThemeMode = "system" | "light" | "dark";

type ThemeValue = {
    colors: Palette;
    scheme: "light" | "dark";
    mode: ThemeMode;
    setMode: (mode: ThemeMode) => void;
};

const SETTING_KEY = "theme.mode";

const ThemeContext = createContext<ThemeValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
    return value === "system" || value === "light" || value === "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const db = useSQLiteContext();
    const systemScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>("system");

    useEffect(() => {
        let active = true;
        getSetting(db, SETTING_KEY).then((stored) => {
            if (active && isThemeMode(stored)) setModeState(stored);
        });
        return () => {
            active = false;
        };
    }, [db]);

    const scheme =
        mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;

    const setMode = (next: ThemeMode) => {
        setModeState(next);
        setSetting(db, SETTING_KEY, next);
    };

    return (
        <ThemeContext.Provider
            value={{ colors: palette[scheme], scheme, mode, setMode }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeValue {
    const value = useContext(ThemeContext);
    if (!value) throw new Error("useTheme must be used inside ThemeProvider");
    return value;
}
