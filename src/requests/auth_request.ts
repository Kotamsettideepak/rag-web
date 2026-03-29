export const google_auth_config = {
  clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "",
  scriptSrc: import.meta.env.VITE_GOOGLE_SCRIPT_SRC?.trim() ?? "",
};
