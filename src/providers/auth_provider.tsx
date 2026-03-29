/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { clearStoredToken, getStoredToken, mapUserFromToken, setStoredToken } from "../lib/auth_storage";
import { google_auth_config } from "../requests/auth_request";
import type { auth_state, auth_user } from "../types/auth";

export interface auth_context_value extends auth_state {
  renderGoogleButton: (element: HTMLElement | null) => void;
  signOut: () => void;
}

export const auth_context = createContext<auth_context_value | null>(null);

function loadGoogleScript(scriptSrc: string) {
  if (!scriptSrc) {
    return Promise.resolve();
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);
  if (existingScript) {
    return new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google script.")), {
        once: true,
      });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script."));
    document.head.appendChild(script);
  });
}

export const AuthProvider = memo(function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<auth_user | null>(() => {
    const storedToken = getStoredToken();
    return storedToken ? mapUserFromToken(storedToken) : null;
  });
  const [isReady, setIsReady] = useState(false);

  const signOut = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    window.google?.accounts?.id?.disableAutoSelect();
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      signOut();
    };

    window.addEventListener("app:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("app:unauthorized", handleUnauthorized);
    };
  }, [signOut]);

  useEffect(() => {
    if (!google_auth_config.clientId || !google_auth_config.scriptSrc) {
      setIsReady(true);
      return;
    }

    let isCancelled = false;

    void loadGoogleScript(google_auth_config.scriptSrc)
      .then(() => {
        if (isCancelled || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: google_auth_config.clientId,
          callback: (response) => {
            if (!response.credential) {
              return;
            }

            setStoredToken(response.credential);
            setToken(response.credential);
            setUser(mapUserFromToken(response.credential));
          },
        });

        setIsReady(true);
      })
      .catch(() => {
        if (!isCancelled) {
          setIsReady(true);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const renderGoogleButton = useCallback((element: HTMLElement | null) => {
    if (!element || !window.google?.accounts?.id || !google_auth_config.clientId) {
      return;
    }

    element.innerHTML = "";
    window.google.accounts.id.renderButton(element, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      width: 260,
    });
  }, []);

  const value = useMemo<auth_context_value>(
    () => ({
      user,
      token,
      isReady,
      status: token && user ? "authenticated" : isReady ? "anonymous" : "booting",
      isAuthenticated: Boolean(token && user),
      renderGoogleButton,
      signOut,
    }),
    [isReady, renderGoogleButton, signOut, token, user],
  );

  return <auth_context.Provider value={value}>{children}</auth_context.Provider>;
});
