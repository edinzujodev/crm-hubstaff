import { and, eq, gt, isNotNull, lt, or, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import type { HubstaffActivityDto, HubstaffProvider } from "./types";

const SLOT_MS = 10 * 60 * 1000;
// Pretend the person walked away and Hubstaff's idle timeout stopped the timer
// after this long, so a forgotten session looks the way it would in real life.
const MOCK_IDLE_STOP_MS = 3 * 60 * 60 * 1000;
export const MOCK_PROJECT_ID = 1000;
export const MOCK_EXTRA_ACTIVITIES_KEY = "mock_extra_activities";

// Deterministic 0..1 value so activity % stays stable between syncs.
function pseudoRandom(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Fake Hubstaff: tracked time is generated from the CRM's own work sessions,
 * as if the desktop timer ran during every session. Fixture activities written
 * by the seed script (e.g. time tracked with no CRM session) are added on top.
 */
export const mockProvider: HubstaffProvider = {
  mode: "mock",

  async createTask({ crmTaskId, projectId }) {
    return { id: 800000 + crmTaskId, projectId: projectId || MOCK_PROJECT_ID };
  },

  async assignTask() {},

  async listActivities(start, stop) {
    const now = Date.now();
    const sessions = await db
      .select({
        id: schema.workSessions.id,
        startedAt: schema.workSessions.startedAt,
        endedAt: schema.workSessions.endedAt,
        hubstaffTaskId: schema.tasks.hubstaffTaskId,
        hubstaffProjectId: schema.tasks.hubstaffProjectId,
        hubstaffUserId: schema.users.hubstaffUserId,
      })
      .from(schema.workSessions)
      .innerJoin(schema.tasks, eq(schema.workSessions.taskId, schema.tasks.id))
      .innerJoin(schema.users, eq(schema.workSessions.userId, schema.users.id))
      .where(
        and(
          isNotNull(schema.tasks.hubstaffTaskId),
          isNotNull(schema.users.hubstaffUserId),
          lt(schema.workSessions.startedAt, stop),
          or(isNull(schema.workSessions.endedAt), gt(schema.workSessions.endedAt, start)),
        ),
      );

    const out: HubstaffActivityDto[] = [];
    for (const s of sessions) {
      const from = s.startedAt.getTime();
      const to = Math.min(s.endedAt?.getTime() ?? now, from + MOCK_IDLE_STOP_MS, now);
      for (let slot = Math.floor(from / SLOT_MS) * SLOT_MS; slot < to; slot += SLOT_MS) {
        if (slot < start.getTime() || slot >= stop.getTime()) continue;
        const tracked = Math.round((Math.min(to, slot + SLOT_MS) - Math.max(from, slot)) / 1000);
        if (tracked <= 0) continue;
        const id = s.id * 100_000 + Math.floor((slot - from) / SLOT_MS) + 1;
        out.push({
          id,
          starts_at: new Date(slot).toISOString(),
          user_id: s.hubstaffUserId!,
          project_id: s.hubstaffProjectId ?? config.hubstaffProjectId ?? MOCK_PROJECT_ID,
          task_id: s.hubstaffTaskId,
          tracked,
          overall: Math.round(tracked * (0.35 + 0.6 * pseudoRandom(id))),
          billable: true,
        });
      }
    }

    const extra = await db.query.appState.findFirst({
      where: eq(schema.appState.key, MOCK_EXTRA_ACTIVITIES_KEY),
    });
    if (extra) {
      for (const a of JSON.parse(extra.value) as HubstaffActivityDto[]) {
        const t = new Date(a.starts_at).getTime();
        if (t >= start.getTime() && t < stop.getTime()) out.push(a);
      }
    }
    return out;
  },
};
