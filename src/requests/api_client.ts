import axios from "axios";
import { clearStoredToken, getStoredToken } from "../lib/auth_storage";
import type { api_error_payload, api_error_shape } from "../types/api";

export const api_base_url = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

if (!api_base_url) {
  throw new Error("VITE_API_BASE_URL is required");
}

export const websocket_base_url = api_base_url.replace(/^http/i, "ws");

export const api_client = axios.create({
  baseURL: api_base_url,
});

api_client.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api_client.interceptors.response.use(
  (response) => response,
  (error) => {
    const nextError = error as api_error_shape & {
      response?: {
        status?: number;
        data?: api_error_payload;
      };
    };

    const normalizedError = new Error(
      nextError.response?.data?.error?.trim() ||
        nextError.response?.data?.message?.trim() ||
        nextError.message ||
        "Request failed",
    ) as api_error_shape;
    normalizedError.status = nextError.response?.status;

    if (normalizedError.status === 401) {
      clearStoredToken();
      window.dispatchEvent(new CustomEvent("app:unauthorized"));
    }

    return Promise.reject(normalizedError);
  },
);
