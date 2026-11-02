import { and, asc, eq, gt, gte, inArray, isNotNull, lt, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";

const SLOT_MS = 10 * 60 * 1000;
// Activities show up in Hubstaff up to ~20 min late; don't call a session empty before that.
const ACTIVITY_DELAY_MS = 30 * 60 * 1000;

export type SessionFlag =
  | { kind: "open_too_long"; hours: number }
  | { kind: "no_hubstaff_time" }
  | { kind: "partly_tracked"; trackedSeconds: number; openSeconds: number }
  | { kind: "auto_closed" }
  | { kind: "overlaps"; otherTaskId: number; otherTaskTitle: string };

export type SessionRow = {
  id: number;
  userName: string;
  startedAt: Date;
  endedAt: Date | null;
  endReason: schema.WorkSession["endReason"];
  openSeconds: number;
  trackedSeconds: number;
  flags: SessionFlag[];
};

export function isSessionStale(startedAt: Date) {
  return Date.now() - startedAt.getTime() > config.staleSessionHours * 3600 * 1000;
}

export type TaskReport = Awaited<ReturnType<typeof getTaskReport>>;

export async function getTaskReport(taskId: number, timeZone: string) {
  const now = Date.now();
  const [activities, sessions, users] = await Promise.all([
    db
      .select()
      .from(schema.hubstaffActivities)
      .where(eq(schema.hubstaffActivities.taskId, taskId))
      .orderBy(asc(schema.hubstaffActivities.startsAt)),
    db
      .select()
      .from(schema.workSessions)
      .where(eq(schema.workSessions.taskId, taskId))
      .orderBy(asc(schema.workSessions.startedAt)),
    db.select().from(schema.users),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const userByHubstaffId = new Map(users.filter((u) => u.hubstaffUserId).map((u) => [u.hubstaffUserId!, u]));

  // Attribute each 10-minute slot to the session (same person) it overlaps.
  const trackedBySession = new Map<number, number>();
  let outsideSessions = 0;
  for (const a of activities) {
    const slotStart = a.startsAt.getTime();
    const user = userByHubstaffId.get(a.hubstaffUserId);
    const session = sessions.find(
      (s) =>
        s.userId === user?.id &&
        slotStart + SLOT_MS > s.startedAt.getTime() &&
        slotStart < (s.endedAt?.getTime() ?? now),
    );
    if (session) trackedBySession.set(session.id, (trackedBySession.get(session.id) ?? 0) + a.trackedSeconds);
    else outsideSessions += a.trackedSeconds;
  }

  const overlaps = await findOverlaps(sessions);

  const sessionRows: SessionRow[] = sessions.map((s) => {
    const end = s.endedAt?.getTime() ?? now;
    const openSeconds = Math.round((end - s.startedAt.getTime()) / 1000);
    const tracked = trackedBySession.get(s.id) ?? 0;
    const flags: SessionFlag[] = [];
    if (!s.endedAt && openSeconds > config.staleSessionHours * 3600) {
      flags.push({ kind: "open_too_long", hours: Math.floor(openSeconds / 3600) });
    }
    const settled = now - end > ACTIVITY_DELAY_MS;
    if (tracked === 0 && openSeconds > 15 * 60 && settled) flags.push({ kind: "no_hubstaff_time" });
    else if (tracked > 0 && openSeconds > 3600 && tracked < openSeconds * 0.5 && settled) {
      flags.push({ kind: "partly_tracked", trackedSeconds: tracked, openSeconds });
    }
    if (s.endReason === "auto_closed") flags.push({ kind: "auto_closed" });
    for (const o of overlaps.get(s.id) ?? []) flags.push({ kind: "overlaps", ...o });
    return {
      id: s.id,
      userName: userById.get(s.userId)?.name ?? `User ${s.userId}`,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      endReason: s.endReason,
      openSeconds,
      trackedSeconds: tracked,
      flags,
    };
  });

  const byUser = new Map<string, { tracked: number; active: number }>();
  const byDay = new Map<string, { tracked: number; active: number }>();
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  for (const a of activities) {
    const name = userByHubstaffId.get(a.hubstaffUserId)?.name ?? `Hubstaff user ${a.hubstaffUserId}`;
    const day = dayFmt.format(a.startsAt);
    for (const [map, key] of [
      [byUser, name],
      [byDay, day],
    ] as const) {
      const cur = map.get(key) ?? { tracked: 0, active: 0 };
      cur.tracked += a.trackedSeconds;
      cur.active += a.activeSeconds;
      map.set(key, cur);
    }
  }

  const trackedSeconds = activities.reduce((n, a) => n + a.trackedSeconds, 0);
  const activeSeconds = activities.reduce((n, a) => n + a.activeSeconds, 0);
  return {
    trackedSeconds,
    activityPercent: trackedSeconds ? Math.round((activeSeconds / trackedSeconds) * 100) : null,
    outsideSessionsSeconds: outsideSessions,
    lastActivityAt: activities.at(-1)?.startsAt ?? null,
    sessions: sessionRows.reverse(),
    byUser: [...byUser].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.tracked - a.tracked),
    byDay: [...byDay].map(([day, v]) => ({ day, ...v })).sort((a, b) => b.day.localeCompare(a.day)),
  };
}

/** Sessions of the same person on other tasks whose time ranges overlap these. */
async function findOverlaps(sessions: schema.WorkSession[]) {
  const result = new Map<number, { otherTaskId: number; otherTaskTitle: string }[]>();
  if (!sessions.length) return result;
  const userIds = [...new Set(sessions.map((s) => s.userId))];
  const first = sessions[0].startedAt;
  const others = await db
    .select({
      id: schema.workSessions.id,
      userId: schema.workSessions.userId,
      taskId: schema.workSessions.taskId,
      startedAt: schema.workSessions.startedAt,
      endedAt: schema.workSessions.endedAt,
      title: schema.tasks.title,
    })
    .from(schema.workSessions)
    .innerJoin(schema.tasks, eq(schema.workSessions.taskId, schema.tasks.id))
    .where(
      and(
        inArray(schema.workSessions.userId, userIds),
        ne(schema.workSessions.taskId, sessions[0].taskId),
        or(isNull(schema.workSessions.endedAt), gt(schema.workSessions.endedAt, first)),
      ),
    );
  const now = Date.now();
  for (const s of sessions) {
    const sEnd = s.endedAt?.getTime() ?? now;
    for (const o of others) {
      if (o.userId !== s.userId) continue;
      const oEnd = o.endedAt?.getTime() ?? now;
      if (o.startedAt.getTime() < sEnd && oEnd > s.startedAt.getTime()) {
        const list = result.get(s.id) ?? [];
        list.push({ otherTaskId: o.taskId, otherTaskTitle: o.title });
        result.set(s.id, list);
      }
    }
  }
  return result;
}

export type ClientReport = Awaited<ReturnType<typeof getClientReport>>;

/**
 * Hubstaff time on a client's CRM tasks between two calendar days (inclusive,
 * `YYYY-MM-DD` in `timeZone`), combined with the client's task list.
 */
export async function getClientReport(clientId: number, from: string, to: string, timeZone: string) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const [tasks, users] = await Promise.all([
    db.select().from(schema.tasks).where(eq(schema.tasks.clientId, clientId)),
    db.select().from(schema.users),
  ]);
  const taskIds = tasks.map((t) => t.id);
  // Query a wider UTC window, then keep the slots whose local day is inside the range.
  const activities = taskIds.length
    ? await db
        .select()
        .from(schema.hubstaffActivities)
        .where(
          and(
            inArray(schema.hubstaffActivities.taskId, taskIds),
            gte(schema.hubstaffActivities.startsAt, new Date(Date.parse(from) - DAY_MS)),
            lt(schema.hubstaffActivities.startsAt, new Date(Date.parse(to) + 2 * DAY_MS)),
          ),
        )
        .orderBy(asc(schema.hubstaffActivities.startsAt))
    : [];

  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const inRange = activities.filter((a) => {
    const day = dayFmt.format(a.startsAt);
    return day >= from && day <= to;
  });

  const userByHubstaffId = new Map(users.filter((u) => u.hubstaffUserId).map((u) => [u.hubstaffUserId!, u.name]));
  type Totals = { tracked: number; active: number };
  const bump = <K>(map: Map<K, Totals>, key: K, a: { trackedSeconds: number; activeSeconds: number }) => {
    const cur = map.get(key) ?? { tracked: 0, active: 0 };
    cur.tracked += a.trackedSeconds;
    cur.active += a.activeSeconds;
    map.set(key, cur);
  };

  const byTask = new Map<number, Totals>();
  const byUser = new Map<string, Totals>();
  const byDay = new Map<string, Totals>();
  for (const a of inRange) {
    bump(byTask, a.taskId!, a);
    bump(byUser, userByHubstaffId.get(a.hubstaffUserId) ?? `Hubstaff user ${a.hubstaffUserId}`, a);
    bump(byDay, dayFmt.format(a.startsAt), a);
  }

  const trackedSeconds = inRange.reduce((n, a) => n + a.trackedSeconds, 0);
  const activeSeconds = inRange.reduce((n, a) => n + a.activeSeconds, 0);
  return {
    trackedSeconds,
    activityPercent: trackedSeconds ? Math.round((activeSeconds / trackedSeconds) * 100) : null,
    taskCount: tasks.length,
    openTaskCount: tasks.filter((t) => t.status !== "done").length,
    tasks: tasks
      .map((t) => ({ task: t, ...(byTask.get(t.id) ?? { tracked: 0, active: 0 }) }))
      .sort((a, b) => b.tracked - a.tracked || b.task.id - a.task.id),
    byUser: [...byUser].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.tracked - a.tracked),
    byDay: [...byDay].map(([day, v]) => ({ day, ...v })).sort((a, b) => b.day.localeCompare(a.day)),
  };
}

/** Total tracked seconds per client since an instant, for the client list. */
export async function trackedByClient(since: Date) {
  const rows = await db
    .select({
      clientId: schema.tasks.clientId,
      tracked: sql<number>`sum(${schema.hubstaffActivities.trackedSeconds})::int`,
    })
    .from(schema.hubstaffActivities)
    .innerJoin(schema.tasks, eq(schema.hubstaffActivities.taskId, schema.tasks.id))
    .where(gte(schema.hubstaffActivities.startsAt, since))
    .groupBy(schema.tasks.clientId);
  return new Map(rows.filter((r) => r.clientId !== null).map((r) => [r.clientId!, r.tracked]));
}

/** Tracked seconds per CRM task, for the task list. */
export async function trackedByTask() {
  const rows = await db
    .select({
      taskId: schema.hubstaffActivities.taskId,
      tracked: sql<number>`sum(${schema.hubstaffActivities.trackedSeconds})::int`,
    })
    .from(schema.hubstaffActivities)
    .where(isNotNull(schema.hubstaffActivities.taskId))
    .groupBy(schema.hubstaffActivities.taskId);
  return new Map(rows.map((r) => [r.taskId!, r.tracked]));
}

/** Hubstaff time from the last 7 days that did not land on any CRM task. */
export async function unmatchedTime() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(schema.hubstaffActivities)
    .where(and(isNull(schema.hubstaffActivities.taskId), gt(schema.hubstaffActivities.startsAt, since)))
    .orderBy(asc(schema.hubstaffActivities.startsAt));
  const users = await db.select().from(schema.users);
  const userByHubstaffId = new Map(users.filter((u) => u.hubstaffUserId).map((u) => [u.hubstaffUserId!, u.name]));
  const groups = new Map<string, { userName: string; hubstaffTaskId: number | null; tracked: number; last: Date }>();
  for (const a of rows) {
    const key = `${a.hubstaffUserId}:${a.hubstaffTaskId ?? "none"}`;
    const g = groups.get(key) ?? {
      userName: userByHubstaffId.get(a.hubstaffUserId) ?? `Hubstaff user ${a.hubstaffUserId}`,
      hubstaffTaskId: a.hubstaffTaskId,
      tracked: 0,
      last: a.startsAt,
    };
    g.tracked += a.trackedSeconds;
    g.last = a.startsAt;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.tracked - a.tracked);
}

