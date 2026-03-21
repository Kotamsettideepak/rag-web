import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

const STORAGE_KEY = "rag_google_id_token";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || "";

function maskClientID(value: string) {
  if (!value) {
    return "(empty)";
  }
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 12)}...${value.slice(-18)}`;
}

export type AuthUser = {
  email: string;
  name: string;
  picture?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  idToken: string | null;
  isReady: boolean;
  isAuthenticated: boolean;
  googleClientId: string;
  renderGoogleButton: (element: HTMLElement | null) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function getStoredGoogleToken() {
  const token = window.localStorage.getItem(STORAGE_KEY);
  console.info("[auth] getStoredGoogleToken", {
    hasToken: !!token,
    tokenLength: token?.length ?? 0,
  });
  return token;
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const json = window.atob(normalized);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function mapUserFromToken(token: string): AuthUser | null {
  const payload = parseJwtPayload(token);
  if (!payload) {
    return null;
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email) {
    return null;
  }

  const name =
    typeof payload.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : email;
  const picture =
    typeof payload.picture === "string" && payload.picture.trim()
      ? payload.picture.trim()
      : undefined;

  return { email, name, picture };
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    console.info("[auth] google script already available");
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${GOOGLE_SCRIPT_SRC}"]`,
  );
  if (existing) {
    console.info("[auth] reusing existing google script tag", {
      src: existing.src,
    });
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script.")), {
        once: true,
      });
    });
  }

  return new Promise((resolve, reject) => {
    console.info("[auth] injecting google script", {
      src: GOOGLE_SCRIPT_SRC,
      origin: window.location.origin,
      clientId: maskClientID(googleClientId),
    });
    const script = document.createElement("script");
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script."));
    document.head.appendChild(script);
  });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [idToken, setIDToken] = useState<string | null>(() => getStoredGoogleToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const token = getStoredGoogleToken();
    return token ? mapUserFromToken(token) : null;
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.info("[auth] AuthProvider init", {
      origin: window.location.origin,
      href: window.location.href,
      clientId: maskClientID(googleClientId),
      hasStoredToken: !!window.localStorage.getItem(STORAGE_KEY),
    });

    if (!googleClientId) {
      console.warn("[auth] missing VITE_GOOGLE_CLIENT_ID");
      setIsReady(true);
      return;
    }

    let cancelled = false;

    void loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) {
          console.warn("[auth] google script loaded but accounts.id unavailable", {
            cancelled,
            hasGoogle: !!window.google,
          });
          return;
        }

        console.info("[auth] initializing google accounts.id", {
          origin: window.location.origin,
          clientId: maskClientID(googleClientId),
        });
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            console.info("[auth] google credential callback received", {
              hasCredential: !!response.credential,
              credentialLength: response.credential?.length ?? 0,
            });
            if (!response.credential) {
              console.warn("[auth] google credential callback missing credential");
              return;
            }

            window.localStorage.setItem(STORAGE_KEY, response.credential);
            setIDToken(response.credential);
            setUser(mapUserFromToken(response.credential));
            console.info("[auth] stored google token from callback", {
              email: mapUserFromToken(response.credential)?.email ?? "(unknown)",
            });
          },
        });

        setIsReady(true);
        console.info("[auth] google auth is ready");
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("[auth] failed to load or initialize google script", error);
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      idToken,
      isReady,
      isAuthenticated: !!idToken && !!user,
      googleClientId,
      renderGoogleButton: (element) => {
        if (!googleClientId) {
          console.warn("[auth] renderGoogleButton called without client id");
          return;
        }
        if (!element) {
          console.warn("[auth] renderGoogleButton called without target element");
          return;
        }
        if (!window.google?.accounts?.id) {
          console.warn("[auth] renderGoogleButton called before google accounts.id was ready");
          return;
        }

        console.info("[auth] rendering google sign-in button", {
          origin: window.location.origin,
          clientId: maskClientID(googleClientId),
        });
        element.innerHTML = "";
        window.google.accounts.id.renderButton(element, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 260,
        });
      },
      signOut: () => {
        console.info("[auth] signing out google user", {
          email: user?.email ?? "(none)",
        });
        window.localStorage.removeItem(STORAGE_KEY);
        setIDToken(null);
        setUser(null);
        window.google?.accounts?.id.disableAutoSelect();
      },
    }),
    [idToken, isReady, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
