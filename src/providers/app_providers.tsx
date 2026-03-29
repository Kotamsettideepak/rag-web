import { memo, type PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth_provider";
import { ThemeProvider } from "./theme_provider";
import { ToastProvider } from "./toast_provider";

export const AppProviders = memo(function AppProviders({ children }: PropsWithChildren) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
});
