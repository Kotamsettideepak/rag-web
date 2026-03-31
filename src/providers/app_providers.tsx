import { memo, type PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth_provider";
import { ToastProvider } from "./toast_provider";

export const AppProviders = memo(function AppProviders({ children }: PropsWithChildren) {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
});
