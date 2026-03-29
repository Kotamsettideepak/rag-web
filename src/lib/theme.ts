import { storage_keys } from "../constants/storage_keys";
import type { theme_mode } from "../types/ui";

export function getStoredTheme(): theme_mode {
  window.localStorage.setItem(storage_keys.theme, "light");
  return "light";
}

export function applyThemeClass() {
  document.documentElement.classList.remove("dark");
}
