import { getToken, sessionExpired } from "./auth";
import { ensurePeople, syncNow } from "./sync";
import type { Person } from "@/domain/sync";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("Sign in first");
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (res.status === 401) {
    sessionExpired();
    throw new Error("Your session ended. Sign in again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json;
}

export async function listFriends(): Promise<Person[]> {
  return (await api<{ friends: Person[] }>("/api/friends")).friends;
}

/** Add by username. The friend appears locally at once; shared rounds follow on the next sync. */
export async function addFriend(username: string): Promise<Person> {
  const { friend } = await api<{ friend: Person }>("/api/friends", { method: "POST", body: JSON.stringify({ username }) });
  await ensurePeople([friend]);
  syncNow().catch(() => {});
  return friend;
}

/** Unfriend. Their player stays on this phone so old rounds keep their name. */
export async function removeFriend(id: string): Promise<void> {
  await api<{ ok: true }>(`/api/friends/${encodeURIComponent(id)}`, { method: "DELETE" });
}
