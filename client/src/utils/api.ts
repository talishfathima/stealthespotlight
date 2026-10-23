import axios from "axios";

const AUTH_TOKEN_KEY = "sts_auth_token";

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined) {
  try {
    if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // sessionStorage can be unavailable in private modes; cookie auth still works.
  }
}

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    (config.headers as Record<string, string>)["x-auth-token"] = token;
  }
  return config;
});

export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { error?: string } | undefined)?.error ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
