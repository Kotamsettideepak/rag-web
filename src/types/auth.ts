export interface auth_user {
  email: string;
  name: string;
  picture?: string;
}

export type session_status = "booting" | "authenticated" | "anonymous";

export interface auth_state {
  user: auth_user | null;
  token: string | null;
  status: session_status;
  isReady: boolean;
  isAuthenticated: boolean;
}
