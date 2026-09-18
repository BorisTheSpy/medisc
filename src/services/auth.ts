import { useSyncExternalStore } from "react";

export interface User {
  id: string;
  username: string;
  displayName: string;
}

const TOKEN_KEY = "medisc.token";
const USER_KEY = "medisc.user";

let state: { token: string | null; user: User | null } = { token: null, user: null };
try {
  state = { token: localStorage.getItem(TOKEN_KEY), user: JSON.parse(localStorage.getItem(USER_KEY) ?? "null") };
} catch {
  /* private mode */
}
const listeners = new Set<() => void>();

function set(next: typeof state) {
  state = next;
  try {
    if (next.token) localStorage.setItem(TOKEN_KEY, next.token);
    else localStorage.removeItem(TOKEN_KEY);
    if (next.user) localStorage.setItem(USER_KEY, JSON.stringify(next.user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function getToken(): string | null {
  return state.token;
}

export function getUser(): User | null {
  return state.user;
}

export function useUser(): User | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state.user,
  );
}

async function call(path: string, body: unknown): Promise<{ token: string; user: User }> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; token?: string; user?: User };
  if (!res.ok || !json.token || !json.user) throw new Error(json.error ?? "Could not sign in");
  return { token: json.token, user: json.user };
}

export async function register(username: string, pin: string, displayName: string): Promise<User> {
  const r = await call("/api/auth/register", { username, pin, displayName });
  set({ token: r.token, user: r.user });
  return r.user;
}

export async function login(username: string, pin: string): Promise<User> {
  const r = await call("/api/auth/login", { username, pin });
  set({ token: r.token, user: r.user });
  return r.user;
}

export async function logout(): Promise<void> {
  const token = state.token;
  set({ token: null, user: null });
  if (token) fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
}

/** Drop the session locally if the server no longer recognises it. */
export function sessionExpired(): void {
  set({ token: null, user: null });
}
