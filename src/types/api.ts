export interface api_error_payload {
  error?: string;
  message?: string;
}

export interface api_error_shape extends Error {
  status?: number;
}
