import { useContext } from "react";
import { auth_context } from "../providers/auth_provider";

export function useAuth() {
  const context = useContext(auth_context);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
