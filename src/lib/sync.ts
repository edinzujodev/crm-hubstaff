import { and, desc, eq, gte, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { hubstaff, type HubstaffActivityDto } from "@/lib/hubstaff";

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 10 * 60 * 1000;
// Hubstaff may report activities up to ~20 min late and people can edit time
// afterwards, so every sync re-reads a trailing window and reconciles it.
const LOOKBACK_DAYS = 3;
const MAX_WINDOW_DAYS = 7; // Hubstaff limit per activities request
const LAST_SYNC_KEY = "last_sync_at";

export type SyncResult = {
  mode: "mock" | "live";
  fetched: number;
  matched: number;
  unmatched: number;
  autoClosed: number;
  from: string;
  to: string;
};

export async function lastSyncAt(): Promise<Date | null> {
  const row = await db.query.appState.findFirst({ where: eq(schema.appState.key, LAST_SYNC_KEY) });
  return row ? new Date(row.value) : null;
}

export async function syncHubstaff(): Promise<SyncResult> {
  const provider = hubstaff();
  const now = new Date();

  // Start far enough back to cover the oldest still-open session.
  const oldestOpen = await db.query.workSessions.findFirst({
    where: isNull(schema.workSessions.endedAt),
    orderBy: schema.workSessions.startedAt,
  });
  let from = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  if (oldestOpen && oldestOpen.startedAt < from) from = oldestOpen.startedAt;
  from = new Date(Math.floor(from.getTime() / SLOT_MS) * SLOT_MS);
  const to = new Date(now.getTime() + SLOT_MS);

  const { fetched, matched } = await syncRange(provider, from, to);

  const autoClosed = await autoCloseForgottenSessions(now);

  await db
    .insert(schema.appState)
    .values({ key: LAST_SYNC_KEY, value: now.toISOString() })
    .onConflictDoUpdate({ target: schema.appState.key, set: { value: now.toISOString(), updatedAt: now } });

  return {
    mode: provider.mode,
    fetched,
    matched,
    unmatched: fetched - matched,
    autoClosed,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

type Provider = ReturnType<typeof hubstaff>;

/** Reads [from, to) from Hubstaff in 7-day windows and reconciles what is stored. */
async function syncRange(provider: Provider, from: Date, to: Date) {
  const taskRows = await db
    .select({ id: schema.tasks.id, hubstaffTaskId: schema.tasks.hubstaffTaskId })
    .from(schema.tasks)
    .where(isNotNull(schema.tasks.hubstaffTaskId));
  const crmTaskByHubstaffId = new Map(taskRows.map((t) => [t.hubstaffTaskId!, t.id]));

  let fetched = 0;
  let matched = 0;
  for (let start = from; start < to; start = new Date(start.getTime() + MAX_WINDOW_DAYS * DAY_MS)) {
    const stop = new Date(Math.min(start.getTime() + MAX_WINDOW_DAYS * DAY_MS, to.getTime()));
    const activities = await provider.listActivities(start, stop);
    fetched += activities.length;
    matched += await upsertActivities(activities, crmTaskByHubstaffId);

    // Anything we stored for this window that Hubstaff no longer returns was
    // deleted or edited away there.
    const ids = activities.map((a) => a.id);
    const inWindow = and(gte(schema.hubstaffActivities.startsAt, start), lt(schema.hubstaffActivities.startsAt, stop));
    await db
      .delete(schema.hubstaffActivities)
      .where(ids.length ? and(inWindow, notInArray(schema.hubstaffActivities.id, ids)) : inWindow);
  }
  return { fetched, matched };
}

/** Loads older Hubstaff time (e.g. before the CRM was used) so reports can cover it. Capped at 92 days. */
export async function backfillHubstaff(fromDay: string, toDay: string) {
  const from = new Date(Math.floor(Date.parse(fromDay) / SLOT_MS) * SLOT_MS - DAY_MS);
  const to = new Date(Math.min(Date.parse(toDay) + 2 * DAY_MS, Date.now() + SLOT_MS));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) throw new Error("Invalid date range.");
  if ((to.getTime() - from.getTime()) / DAY_MS > 95) throw new Error("Load at most about 3 months at a time.");
  return syncRange(hubstaff(), from, to);
}

async function upsertActivities(activities: HubstaffActivityDto[], crmTaskByHubstaffId: Map<number, number>) {
  let matched = 0;
  const rows = activities.map((a) => {
    const taskId = a.task_id ? (crmTaskByHubstaffId.get(a.task_id) ?? null) : null;
    if (taskId) matched++;
    return {
      id: a.id,
      startsAt: new Date(a.starts_at),
      hubstaffUserId: a.user_id,
      hubstaffProjectId: a.project_id,
      hubstaffTaskId: a.task_id,
      taskId,
      trackedSeconds: a.tracked,
      activeSeconds: a.overall,
      billable: a.billable ?? null,
      raw: a,
      syncedAt: new Date(),
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await db
      .insert(schema.hubstaffActivities)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.hubstaffActivities.id,
        set: {
          startsAt: sqlExcluded("starts_at"),
          hubstaffUserId: sqlExcluded("hubstaff_user_id"),
          hubstaffProjectId: sqlExcluded("hubstaff_project_id"),
          hubstaffTaskId: sqlExcluded("hubstaff_task_id"),
          taskId: sqlExcluded("task_id"),
          trackedSeconds: sqlExcluded("tracked_seconds"),
          activeSeconds: sqlExcluded("active_seconds"),
          billable: sqlExcluded("billable"),
          raw: sqlExcluded("raw"),
          syncedAt: sqlExcluded("synced_at"),
        },
      });
  }
  return matched;
}

function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

/**
 * Sessions open longer than AUTO_CLOSE_SESSION_HOURS are closed at the end of
 * the last Hubstaff activity tracked for that task and person inside the
 * session (or at the session start if Hubstaff tracked nothing).
 */
async function autoCloseForgottenSessions(now: Date) {
  const cutoff = new Date(now.getTime() - config.autoCloseSessionHours * 60 * 60 * 1000);
  const stale = await db
    .select({
      id: schema.workSessions.id,
      taskId: schema.workSessions.taskId,
      startedAt: schema.workSessions.startedAt,
      hubstaffUserId: schema.users.hubstaffUserId,
    })
    .from(schema.workSessions)
    .innerJoin(schema.users, eq(schema.workSessions.userId, schema.users.id))
    .where(and(isNull(schema.workSessions.endedAt), lt(schema.workSessions.startedAt, cutoff)));

  for (const s of stale) {
    let endedAt = s.startedAt;
    if (s.hubstaffUserId) {
      const last = await db.query.hubstaffActivities.findFirst({
        where: and(
          eq(schema.hubstaffActivities.taskId, s.taskId),
          eq(schema.hubstaffActivities.hubstaffUserId, s.hubstaffUserId),
          gte(schema.hubstaffActivities.startsAt, new Date(s.startedAt.getTime() - SLOT_MS)),
        ),
        orderBy: desc(schema.hubstaffActivities.startsAt),
      });
      if (last) endedAt = new Date(Math.max(s.startedAt.getTime(), last.startsAt.getTime() + SLOT_MS));
    }
    await db
      .update(schema.workSessions)
      .set({ endedAt, endReason: "auto_closed" })
      .where(eq(schema.workSessions.id, s.id));
  }
  return stale.length;
}
