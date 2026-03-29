/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  memo,
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { ToastViewport } from "../components/ui/toast";
import type { toast_item, toast_variant } from "../types/ui";

export interface toast_context_value {
  toasts: toast_item[];
  pushToast: (title: string, description?: string, variant?: toast_variant) => void;
  removeToast: (id: string) => void;
}

export const toast_context = createContext<toast_context_value | null>(null);

export const ToastProvider = memo(function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<toast_item[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, description?: string, variant: toast_variant = "info") => {
      const id = crypto.randomUUID();
      setToasts((currentToasts) => [...currentToasts, { id, title, description, variant }]);
      window.setTimeout(() => {
        removeToast(id);
      }, 4200);
    },
    [removeToast],
  );

  const value = useMemo(
    () => ({
      toasts,
      pushToast,
      removeToast,
    }),
    [pushToast, removeToast, toasts],
  );

  return (
    <toast_context.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onClose={removeToast} />
    </toast_context.Provider>
  );
});
