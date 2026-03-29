import { storage_keys } from "../constants/storage_keys";
import type { auth_user } from "../types/auth";

function parseJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(window.atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return window.localStorage.getItem(storage_keys.googleToken);
}

export function setStoredToken(token: string) {
  window.localStorage.setItem(storage_keys.googleToken, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(storage_keys.googleToken);
}

export function mapUserFromToken(token: string): auth_user | null {
  const payload = parseJwtPayload(token);
  if (!payload) {
    return null;
  }

  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  if (!email) {
    return null;
  }

  const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email;
  const picture =
    typeof payload.picture === "string" && payload.picture.trim() ? payload.picture.trim() : undefined;

  return { email, name, picture };
}
