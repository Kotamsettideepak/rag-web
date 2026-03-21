import { getStoredGoogleToken } from "../auth/googleAuth";

const DEFAULT_API_BASE_URL = 'http://localhost:8080'

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL

export const websocketBaseUrl = apiBaseUrl.replace(/^http/i, 'ws')

export function getAuthToken() {
  return getStoredGoogleToken()
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  console.info('[api] request', {
    path,
    apiBaseUrl,
    hasToken: !!token,
    tokenLength: token?.length ?? 0,
    method: init?.method || 'GET',
  })
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    console.error('[api] request failed', {
      path,
      status: response.status,
      statusText: response.statusText,
    })
    throw new Error(`Request failed with status ${response.status}`)
  }

  console.info('[api] request succeeded', {
    path,
    status: response.status,
  })
  return (await response.json()) as T
}
