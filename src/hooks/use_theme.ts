import { useContext } from "react";
import { theme_context } from "../providers/theme_provider";

export function useTheme() {
  const context = useContext(theme_context);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
