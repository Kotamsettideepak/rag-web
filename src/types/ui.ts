export type theme_mode = "light" | "dark";
export type toast_variant = "info" | "success" | "warning" | "danger";

export interface toast_item {
  id: string;
  title: string;
  description?: string;
  variant: toast_variant;
}

export interface dropdown_option {
  id: string;
  label: string;
  onSelect: () => void;
}
