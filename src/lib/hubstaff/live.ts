import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import type { CreateTaskInput, HubstaffActivityDto, HubstaffProvider } from "./types";

const API = "https://api.hubstaff.com/v2";
const TOKEN_URL = "https://account.hubstaff.com/access_tokens";
const REFRESH_TOKEN_KEY = "hubstaff_refresh_token";

let accessToken: { value: string; expiresAt: number } | null = null;
let refreshing: Promise<string> | null = null;

async function readState(key: string) {
  const row = await db.query.appState.findFirst({ where: eq(schema.appState.key, key) });
  return row?.value ?? null;
}

async function writeState(key: string, value: string) {
  await db
    .insert(schema.appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value, updatedAt: new Date() } });
}

// Hubstaff personal access tokens are refresh tokens. Each exchange may return a
// new refresh token, so the latest one is kept in the DB and the env value is
// only used the first time.
async function refreshAccessToken(): Promise<string> {
  const refreshToken = (await readState(REFRESH_TOKEN_KEY)) ?? process.env.HUBSTAFF_REFRESH_TOKEN;
  if (!refreshToken) throw new Error("HUBSTAFF_REFRESH_TOKEN is not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) {
    throw new Error(`Hubstaff token exchange failed (${res.status}). Create a new personal access token and reset it in .env.`);
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
  if (body.refresh_token && body.refresh_token !== refreshToken) {
    await writeState(REFRESH_TOKEN_KEY, body.refresh_token);
  }
  const ttlMs = (body.expires_in ?? 3600) * 1000;
  accessToken = { value: body.access_token, expiresAt: Date.now() + ttlMs - 60_000 };
  return body.access_token;
}

async function getAccessToken(): Promise<string> {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.value;
  // Only one exchange at a time, otherwise a rotated refresh token is used twice.
  refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
  return refreshing;
}

async function api<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (res.status === 401 && attempt === 0) {
    accessToken = null;
    return api(path, init, attempt + 1);
  }
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("retry-after")) || 2 ** attempt * 2;
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`Hubstaff ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Raw GET for scripts (e.g. scripts/hubstaff-ids.ts). */
export function hubstaffGet<T>(path: string) {
  return api<T>(path);
}

function orgId(): number {
  const id = config.hubstaffOrgId;
  if (!id) throw new Error("HUBSTAFF_ORG_ID is not set");
  return id;
}

export const liveProvider: HubstaffProvider = {
  mode: "live",

  async createTask({ projectId, summary, assigneeHubstaffUserId }: CreateTaskInput) {
    const { task } = await api<{ task: { id: number; project_id: number } }>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ summary, ...(assigneeHubstaffUserId ? { assignee_id: assigneeHubstaffUserId } : {}) }),
    });
    return { id: task.id, projectId: task.project_id };
  },

  async assignTask(hubstaffTaskId, hubstaffUserId) {
    const { task } = await api<{ task: { lock_version: number } }>(`/tasks/${hubstaffTaskId}`);
    await api(`/tasks/${hubstaffTaskId}`, {
      method: "PUT",
      body: JSON.stringify({ lock_version: task.lock_version, assignee_id: hubstaffUserId }),
    });
  },

  async renameTask(hubstaffTaskId, rename) {
    const { task } = await api<{ task: { lock_version: number; summary: string } }>(`/tasks/${hubstaffTaskId}`);
    const summary = rename(task.summary);
    if (summary === task.summary) return;
    await api(`/tasks/${hubstaffTaskId}`, {
      method: "PUT",
      body: JSON.stringify({ lock_version: task.lock_version, summary }),
    });
  },

  async listActivities(start, stop) {
    const out: HubstaffActivityDto[] = [];
    let pageStartId: number | undefined;
    do {
      const qs = new URLSearchParams({
        "time_slot[start]": start.toISOString(),
        "time_slot[stop]": stop.toISOString(),
        page_limit: "500",
      });
      if (pageStartId) qs.set("page_start_id", String(pageStartId));
      const page = await api<{
        activities: HubstaffActivityDto[];
        pagination?: { next_page_start_id?: number };
      }>(`/organizations/${orgId()}/activities?${qs}`);
      out.push(...page.activities);
      pageStartId = page.pagination?.next_page_start_id;
    } while (pageStartId);
    return out;
  },
};
