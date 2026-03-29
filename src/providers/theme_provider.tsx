/* eslint-disable react-refresh/only-export-components */
import { createContext, memo, useCallback, useMemo, useState, type PropsWithChildren } from "react";
import { storage_keys } from "../constants/storage_keys";
import { applyThemeClass, getStoredTheme } from "../lib/theme";
import type { theme_mode } from "../types/ui";

export interface theme_context_value {
  theme: theme_mode;
  toggleTheme: () => void;
}

export const theme_context = createContext<theme_context_value | null>(null);

export const ThemeProvider = memo(function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<theme_mode>(() => getStoredTheme());

  const toggleTheme = useCallback(() => {
    setTheme("light");
    applyThemeClass();
    window.localStorage.setItem(storage_keys.theme, "light");
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
    }),
    [theme, toggleTheme],
  );

  return <theme_context.Provider value={value}>{children}</theme_context.Provider>;
});
