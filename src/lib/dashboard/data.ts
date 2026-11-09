import { cache } from "react";
import { and, asc, desc as sqlDesc, eq, isNull, ne, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAuth, taskScope, type Auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { rangePresets } from "@/lib/report-range";
import { getTimeReport, type TimeReportFilter } from "@/lib/time-report";
import { DEFAULT_LEVELS, hoursUntilDue, urgencyOf, type Urgency } from "@/lib/urgency";
import { getDirectory, type Scope } from "@/lib/dashboard/scope";
import { starterLayout, type RangeKey, type Size } from "@/lib/dashboard/config";

// ---------------------------------------------------------------------------------------------
// The person's widgets
// ---------------------------------------------------------------------------------------------

/** The signed-in person's widgets in order. The first visit fills in the starter layout for their role. */
export async function getWidgets(auth: Auth) {
  const userId = auth.user.id;
  // Claim the one-time seeding atomically, so two tabs opening at once don't both insert it.
  const claimed = await db
    .update(schema.users)
    .set({ dashboardSeededAt: new Date() })
    .where(and(eq(schema.users.id, userId), isNull(schema.users.dashboardSeededAt)))
    .returning({ id: schema.users.id });
  if (claimed.length) await insertStarter(auth);
  return db
    .select()
    .from(schema.dashboardWidgets)
    .where(eq(schema.dashboardWidgets.userId, userId))
    .orderBy(asc(schema.dashboardWidgets.position), asc(schema.dashboardWidgets.id));
}

export async function insertStarter(auth: Auth) {
  const rows = starterLayout(auth.role).map((w, i) => ({
    userId: auth.user.id,
    type: w.type,
    config: w.config,
    size: w.size satisfies Size,
    position: i,
  }));
  if (rows.length) await db.insert(schema.dashboardWidgets).values(rows);
}

// ---------------------------------------------------------------------------------------------
// Shared, per-request data
// ---------------------------------------------------------------------------------------------

/** Calendar range for a preset, in the app's time zone. */
export function resolveRange(key: RangeKey): { from: string; to: string } {
  const tz = config.timeZone;
  const today = localDay(new Date(), tz);
  if (key === "today") return { from: today, to: today };
  const label = {
    this_week: "This week",
    last_7: "Last 7 days",
    this_month: "This month",
    last_month: "Last month",
    last_30: "Last 30 days",
  }[key];
  const p = rangePresets(tz).find((r) => r.label === label)!;
  return { from: p.from, to: p.to };
}

const cachedReport = cache((key: string) => getTimeReport(JSON.parse(key) as TimeReportFilter));
/** Hubstaff time for a scope and range. Widgets that ask for the same thing share one query. */
export function timeReport(scope: Scope, range: RangeKey, clientId: number | null = null) {
  const { from, to } = resolveRange(range);
  const filter: TimeReportFilter = { from, to, timeZone: config.timeZone, userId: scope.userId, teamId: scope.teamId, clientId };
  return cachedReport(JSON.stringify(filter));
}

export type OpenTask = {
  task: schema.Task;
  clientName: string | null;
  assigneeName: string | null;
  teamName: string | null;
  urgency: Urgency;
  /** Hours until the end of the due day; negative once overdue; null without a due date. */
  hours: number | null;
};

/** SQL for the tasks of a scope. Always combined with the viewer's own task scope. */
function scopeWhere(auth: Auth, s: Scope): SQL | undefined {
  const who = s.userId ? eq(schema.tasks.assigneeId, s.userId) : s.teamId ? eq(schema.tasks.teamId, s.teamId) : undefined;
  return and(who, taskScope(auth));
}

const cachedOpen = cache(async (userId: number | null, teamId: number | null): Promise<OpenTask[]> => {
  const auth = await getAuth();
  if (!auth) return [];
  const [rows, dir] = await Promise.all([
    db
      .select({ task: schema.tasks, clientName: schema.clients.name, assigneeName: schema.users.name })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
      .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
      .where(and(isNull(schema.tasks.deletedAt), ne(schema.tasks.status, "done"), scopeWhere(auth, { userId, teamId })))
      .orderBy(asc(schema.tasks.dueDate), asc(schema.tasks.id)),
    getDirectory(),
  ]);
  const tz = config.timeZone;
  const now = new Date();
  const today = localDay(now, tz);
  const out: OpenTask[] = [];
  for (const { task, clientName, assigneeName } of rows) {
    // A repeat copy that hasn't reached its start date isn't active yet.
    if (task.startDate && task.startDate > today) continue;
    const team = task.teamId ? dir.teamById.get(task.teamId) : undefined;
    out.push({
      task,
      clientName,
      assigneeName,
      teamName: team?.name ?? null,
      urgency: urgencyOf(task, team ?? DEFAULT_LEVELS, tz, now) ?? "on_track",
      hours: task.dueDate ? hoursUntilDue(task.dueDate, tz, now) : null,
    });
  }
  return out;
});

/** Open (not done, not deleted, already started) tasks in a scope, with their urgency. Cached per request. */
export const openTasks = (s: Scope) => cachedOpen(s.userId, s.teamId);

/** Recently finished tasks in a scope. */
export async function doneTasks(auth: Auth, s: Scope, limit: number) {
  return db
    .select({ task: schema.tasks, clientName: schema.clients.name, assigneeName: schema.users.name })
    .from(schema.tasks)
    .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
    .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
    .where(and(isNull(schema.tasks.deletedAt), eq(schema.tasks.status, "done"), scopeWhere(auth, s)))
    .orderBy(sqlDesc(schema.tasks.doneAt), sqlDesc(schema.tasks.id))
    .limit(limit);
}
