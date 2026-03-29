import { useContext } from "react";
import { toast_context } from "../providers/toast_provider";

export function useToast() {
  const context = useContext(toast_context);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
