import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { localDay } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NO_CLIENT = "Not on a CRM client";
export const NO_TEAM = "No team";

export type TimeReportFilter = {
  from: string; // YYYY-MM-DD, inclusive, in `timeZone`
  to: string;
  timeZone: string;
  clientId?: number | null;
  /** CRM user id. */
  userId?: number | null;
  /** CRM team id: only people in this team. */
  teamId?: number | null;
};

export type Totals = { tracked: number; active: number; billable: number };
export type Row = Totals & { key: string; label: string; href?: string };

/** One line per person, client, task and day; the building block of every table and the CSV. */
export type Line = Totals & {
  day: string;
  userKey: string;
  userName: string;
  userHref?: string;
  teamKey: string;
  teamName: string;
  teamHref?: string;
  clientKey: string;
  clientName: string;
  clientHref?: string;
  taskKey: string;
  taskTitle: string;
  taskHref?: string;
};

const empty = (): Totals => ({ tracked: 0, active: 0, billable: 0 });
const add = (t: Totals, a: Totals) => {
  t.tracked += a.tracked;
  t.active += a.active;
  t.billable += a.billable;
};

export type TimeReport = Awaited<ReturnType<typeof getTimeReport>>;

/**
 * Hubstaff time over a date range, joined to the CRM's clients, tasks and
 * people. Time that did not land on a CRM task is kept under its own labels so
 * the totals match Hubstaff.
 */
export async function getTimeReport(f: TimeReportFilter) {
  const [activities, users, taskRows, teams] = await Promise.all([
    db
      .select()
      .from(schema.hubstaffActivities)
      .where(
        and(
          gte(schema.hubstaffActivities.startsAt, new Date(Date.parse(f.from) - DAY_MS)),
          lt(schema.hubstaffActivities.startsAt, new Date(Date.parse(f.to) + 2 * DAY_MS)),
        ),
      )
      .orderBy(asc(schema.hubstaffActivities.startsAt)),
    db.select().from(schema.users),
    db
      .select({ task: schema.tasks, clientName: schema.clients.name })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id)),
    db.select().from(schema.teams),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const userByHubstaffId = new Map(users.filter((u) => u.hubstaffUserId).map((u) => [u.hubstaffUserId!, u]));
  const taskById = new Map(taskRows.map((r) => [r.task.id, r]));
  const filterUser = f.userId ? users.find((u) => u.id === f.userId) : undefined;

  const lines = new Map<string, Line>();
  for (const a of activities) {
    const day = localDay(a.startsAt, f.timeZone);
    if (day < f.from || day > f.to) continue;

    const user = userByHubstaffId.get(a.hubstaffUserId);
    if (f.userId && user?.id !== f.userId) continue;
    if (f.teamId && user?.teamId !== f.teamId) continue;
    const team = user?.teamId ? teamById.get(user.teamId) : undefined;

    const taskRow = a.taskId ? taskById.get(a.taskId) : undefined;
    const clientId = taskRow?.task.clientId ?? null;
    if (f.clientId && clientId !== f.clientId) continue;

    const line = {
      userKey: user ? `u${user.id}` : `h${a.hubstaffUserId}`,
      userName: user?.name ?? `Hubstaff user ${a.hubstaffUserId}`,
      userHref: user ? `/reports?user=${user.id}` : undefined,
      teamKey: team ? `team${team.id}` : "noteam",
      teamName: team?.name ?? NO_TEAM,
      teamHref: team ? `/reports?team=${team.id}` : undefined,
      clientKey: clientId ? `c${clientId}` : "none",
      clientName: clientId ? (taskRow?.clientName ?? `Client ${clientId}`) : NO_CLIENT,
      clientHref: clientId ? `/clients/${clientId}` : undefined,
      taskKey: taskRow ? `t${taskRow.task.id}` : a.hubstaffTaskId ? `h${a.hubstaffTaskId}` : "none",
      taskTitle: taskRow
        ? taskRow.task.title
        : a.hubstaffTaskId
          ? `Hubstaff task #${a.hubstaffTaskId} (not in the CRM)`
          : "No task selected",
      taskHref: taskRow ? `/tasks/${taskRow.task.id}` : undefined,
    };
    const key = `${day}|${line.userKey}|${line.taskKey}`;
    const cur = lines.get(key) ?? { day, ...line, ...empty() };
    cur.tracked += a.trackedSeconds;
    cur.active += a.activeSeconds;
    if (a.billable) cur.billable += a.trackedSeconds;
    lines.set(key, cur);
  }
  const all = [...lines.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || a.userName.localeCompare(b.userName) || a.taskTitle.localeCompare(b.taskTitle),
  );

  function group(keyOf: (l: Line) => { key: string; label: string; href?: string }): Row[] {
    const map = new Map<string, Row>();
    for (const l of all) {
      const k = keyOf(l);
      const row = map.get(k.key) ?? { ...k, ...empty() };
      add(row, l);
      map.set(k.key, row);
    }
    return [...map.values()];
  }
  const byTracked = (a: Row, b: Row) => b.tracked - a.tracked;

  const byClient = group((l) => ({ key: l.clientKey, label: l.clientName, href: l.clientHref })).sort(byTracked);
  const byTeam = group((l) => ({ key: l.teamKey, label: l.teamName, href: l.teamHref })).sort(byTracked);
  const byUser = group((l) => ({ key: l.userKey, label: l.userName, href: l.userHref })).sort(byTracked);
  const byTask = group((l) => ({ key: l.taskKey, label: l.taskTitle, href: l.taskHref })).sort(byTracked);
  const byDay = group((l) => ({ key: l.day, label: l.day })).sort((a, b) => b.key.localeCompare(a.key));

  // Client x person matrix, for "who worked how long on which client".
  const people = byUser.map((r) => ({ key: r.key, label: r.label, href: r.href }));
  const matrix = byClient.map((c) => ({
    ...c,
    cells: people.map((p) => {
      const t = empty();
      for (const l of all) if (l.clientKey === c.key && l.userKey === p.key) add(t, l);
      return t;
    }),
  }));

  const total = empty();
  for (const l of all) add(total, l);

  return {
    lines: all,
    total,
    activityPercent: total.tracked ? Math.round((total.active / total.tracked) * 100) : null,
    daysWorked: byDay.length,
    byClient,
    byTeam,
    byUser,
    byTask,
    byDay,
    people,
    matrix,
    filterUserName: filterUser?.name ?? null,
    filterTeamName: f.teamId ? (teamById.get(f.teamId)?.name ?? null) : null,
  };
}

/** One entry per calendar day in the range, zero-filled, for charts. */
export function dailySeries(report: TimeReport, from: string, to: string) {
  const byDay = new Map(report.byDay.map((r) => [r.key, r]));
  const out: (Totals & { day: string })[] = [];
  for (let t = Date.parse(from); t <= Date.parse(to) && out.length < 120; t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10);
    out.push({ day, ...(byDay.get(day) ?? empty()) });
  }
  return out;
}
