import Link from "next/link";
import { connection } from "next/server";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { BarList } from "@/components/charts/bar-list";
import { ChartTip } from "@/components/charts/chart-tip";
import { ColumnChart } from "@/components/charts/column-chart";
import { LineChart } from "@/components/charts/line-chart";
import type { Auth } from "@/lib/auth";
import { pct, toBars } from "@/lib/bars";
import { longDay } from "@/lib/chart";
import { config } from "@/lib/config";
import { WIDGETS, parseConfig, type WidgetType } from "@/lib/dashboard/config";
import { doneTasks, openTasks, resolveRange, timeReport } from "@/lib/dashboard/data";
import { getDirectory, resolveScope, resolveTeam, type Scope } from "@/lib/dashboard/scope";
import { fmtDateTime, fmtDay, fmtDuration, truncate } from "@/lib/format";
import { isSessionStale } from "@/lib/report";
import { dailySeries } from "@/lib/time-report";
import { URGENCY_CLASS, timeLeftLabel, type Urgency } from "@/lib/urgency";

const EVERYONE: Scope = { userId: null, teamId: null };

function Note({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

function Narrowed() {
  return <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">Narrowed to the data you are allowed to see.</p>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-700 dark:text-red-400" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "";
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function ViewAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 border-t border-border pt-2 text-xs">
      <Link href={href} className="text-muted underline hover:text-foreground">
        {children}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

type DueBadge = { dueDate: string | null; urgency: Urgency | null };

function Due({ dueDate, urgency }: DueBadge) {
  if (!dueDate) return <span className="text-xs text-muted">No deadline</span>;
  if (!urgency || urgency === "on_track") return <span className="whitespace-nowrap text-xs text-muted">{fmtDay(dueDate)}</span>;
  return (
    <span className={`badge whitespace-nowrap ${URGENCY_CLASS[urgency]}`} title={`Due ${fmtDay(dueDate)}`}>
      {timeLeftLabel(dueDate, config.timeZone)}
    </span>
  );
}

async function TasksWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("tasks", raw);
  const r = await resolveScope(auth, cfg);
  if (r.needsSetup) return <Note>Choose a person in this widget&apos;s settings.</Note>;

  type Row = { id: number; title: string; clientName: string | null; assigneeName: string | null; dueDate: string | null; urgency: Urgency | null };
  let rows: Row[];
  let total: number;
  if (cfg.show === "done") {
    const done = await doneTasks(auth, r.scope, cfg.limit + 1);
    const filtered = done.filter((d) => !cfg.clientId || d.task.clientId === cfg.clientId);
    total = filtered.length;
    rows = filtered.slice(0, cfg.limit).map((d) => ({
      id: d.task.id,
      title: d.task.title,
      clientName: d.clientName,
      assigneeName: d.assigneeName,
      dueDate: d.task.dueDate,
      urgency: null,
    }));
  } else {
    const all = (await openTasks(r.scope))
      .filter((t) => (cfg.clientId ? t.task.clientId === cfg.clientId : true))
      .filter((t) => (cfg.show === "in_progress" ? t.task.status === "in_progress" : true))
      .filter((t) => {
        if (cfg.due === "overdue") return t.hours !== null && t.hours < 0;
        if (cfg.due === "critical") return t.urgency === "critical";
        if (cfg.due === "attention") return t.urgency !== "on_track";
        return true;
      });
    if (cfg.sort === "newest") all.sort((a, b) => b.task.id - a.task.id);
    else all.sort((a, b) => (a.hours ?? Infinity) - (b.hours ?? Infinity) || a.task.id - b.task.id);
    total = all.length;
    rows = all.slice(0, cfg.limit).map((t) => ({
      id: t.task.id,
      title: t.task.title,
      clientName: t.clientName,
      assigneeName: t.assigneeName,
      dueDate: t.task.dueDate,
      urgency: t.urgency,
    }));
  }

  const showAssignee = r.scope.userId === null;
  const link = auth.role === "worker" || r.scope.userId === auth.user.id ? "/tasks" : "/tasks?show=everyone";
  return (
    <>
      {r.clamped && <Narrowed />}
      {rows.length === 0 ? (
        <Note>{cfg.due === "overdue" ? "Nothing is running late." : "No tasks here."}</Note>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <Link href={`/tasks/${t.id}`} className="block truncate font-medium hover:underline" title={t.title}>
                  {truncate(t.title, 70)}
                </Link>
                <p className="truncate text-xs text-muted">
                  {[t.clientName, showAssignee ? (t.assigneeName ?? "Unassigned") : null].filter(Boolean).join(" · ") || "No client"}
                </p>
              </div>
              <Due dueDate={t.dueDate} urgency={t.urgency} />
            </li>
          ))}
        </ul>
      )}
      <ViewAll href={link}>{total > rows.length ? `Showing ${rows.length} of ${total}. ` : ""}Open the task list →</ViewAll>
    </>
  );
}

async function TaskCountsWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("task-counts", raw);
  const r = await resolveScope(auth, cfg);
  if (r.needsSetup) return <Note>Choose a person in this widget&apos;s settings.</Note>;
  const open = await openTasks(r.scope);
  const late = open.filter((t) => t.hours !== null && t.hours < 0).length;
  const soon = open.filter((t) => t.hours !== null && t.hours >= 0 && t.urgency !== "on_track").length;
  return (
    <>
      {r.clamped && <Narrowed />}
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        <Stat label="Open" value={open.length} />
        <Stat label="In progress" value={open.filter((t) => t.task.status === "in_progress").length} />
        <Stat label="Running late" value={late} tone={late ? "bad" : undefined} />
        <Stat label="Due soon" value={soon} tone={soon ? "warn" : undefined} />
      </div>
    </>
  );
}

async function StatsWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("stats", raw);
  const r = await resolveScope(auth, cfg);
  if (r.needsSetup) return <Note>Choose a person in this widget&apos;s settings.</Note>;
  const report = await timeReport(r.scope, cfg.range, cfg.clientId);
  return (
    <>
      {r.clamped && <Narrowed />}
      <div className="grid grid-cols-2 gap-2 @md:grid-cols-4">
        <Stat label="Tracked" value={fmtDuration(report.total.tracked)} />
        <Stat label="Billable" value={fmtDuration(report.total.billable)} />
        <Stat label="Activity" value={report.activityPercent === null ? "—" : `${report.activityPercent}%`} />
        <Stat label="Days with time" value={report.daysWorked} />
      </div>
    </>
  );
}

async function TimeChartWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("time-chart", raw);
  const r = await resolveScope(auth, cfg);
  if (r.needsSetup) return <Note>Choose a person in this widget&apos;s settings.</Note>;
  const report = await timeReport(r.scope, cfg.range, cfg.clientId);
  const { from, to } = resolveRange(cfg.range);
  const days = dailySeries(report, from, to);
  return (
    <>
      {r.clamped && <Narrowed />}
      <ChartTip>
        {cfg.metric === "activity" ? (
          <LineChart
            ariaLabel={`Activity percentage per day from ${from} to ${to}.`}
            data={days.map((d) => ({
              key: d.day,
              value: d.tracked ? Math.round((d.active / d.tracked) * 100) : null,
              tip: d.tracked ? `${pct(d.tracked, d.active)} active\n${longDay(d.day)}\n${fmtDuration(d.tracked)} tracked` : `No time tracked\n${longDay(d.day)}`,
            }))}
          />
        ) : (
          <ColumnChart
            ariaLabel={`Hours tracked per day from ${from} to ${to}.`}
            data={days.map((d) => ({
              key: d.day,
              label: fmtDuration(d.tracked),
              value: d.tracked / 3600,
              tip: `${fmtDuration(d.tracked)}\n${longDay(d.day)}\nBillable ${fmtDuration(d.billable)} · Activity ${pct(d.tracked, d.active)}`,
            }))}
          />
        )}
      </ChartTip>
    </>
  );
}

async function TimeBreakdownWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("time-breakdown", raw);
  const r = await resolveScope(auth, cfg);
  if (r.needsSetup) return <Note>Choose a person in this widget&apos;s settings.</Note>;
  const report = await timeReport(r.scope, cfg.range);
  const rows = { client: report.byClient, person: report.byUser, team: report.byTeam, task: report.byTask }[cfg.by];
  return (
    <>
      {r.clamped && <Narrowed />}
      <ChartTip>
        <BarList data={toBars(rows, report.total.tracked)} />
      </ChartTip>
      <ViewAll href="/reports">Full reports →</ViewAll>
    </>
  );
}

async function ClientsWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("clients", raw);
  // A leader's view is their team's; reports and task counts both follow that.
  const scope: Scope = auth.role === "leader" ? { userId: null, teamId: auth.ledTeam?.id ?? -1 } : EVERYONE;
  const [dir, open, report] = await Promise.all([getDirectory(), openTasks(scope), timeReport(scope, cfg.range)]);
  const tracked = new Map(report.byClient.map((c) => [c.key, c.tracked]));
  const rows = dir.clients
    .map((c) => {
      const mine = open.filter((t) => t.task.clientId === c.id);
      return {
        id: c.id,
        name: c.name,
        open: mine.length,
        late: mine.filter((t) => t.hours !== null && t.hours < 0).length,
        tracked: tracked.get(`c${c.id}`) ?? 0,
      };
    })
    .filter((c) => c.open > 0 || c.tracked > 0);
  rows.sort((a, b) => {
    if (cfg.sort === "name") return a.name.localeCompare(b.name);
    const key = cfg.sort === "late" ? "late" : cfg.sort === "open" ? "open" : "tracked";
    return b[key] - a[key] || b.tracked - a.tracked || a.name.localeCompare(b.name);
  });
  const shown = rows.slice(0, cfg.limit);
  return (
    <>
      {shown.length === 0 ? (
        <Note>No client has open tasks or tracked time.</Note>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Client</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
                <th className="px-3 py-2 text-right font-medium">Late</th>
                <th className="py-2 pl-3 text-right font-medium">Tracked</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{c.open}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${c.late ? "text-red-700 dark:text-red-400" : "text-muted"}`}>{c.late}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums">{c.tracked ? fmtDuration(c.tracked) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ViewAll href="/clients">{rows.length > shown.length ? `Showing ${shown.length} of ${rows.length}. ` : ""}All clients →</ViewAll>
    </>
  );
}

async function openSessions() {
  return db
    .select({
      id: schema.workSessions.id,
      userId: schema.workSessions.userId,
      startedAt: schema.workSessions.startedAt,
      taskId: schema.tasks.id,
      title: schema.tasks.title,
    })
    .from(schema.workSessions)
    .innerJoin(schema.tasks, eq(schema.workSessions.taskId, schema.tasks.id))
    .where(isNull(schema.workSessions.endedAt));
}

async function TeamWorkloadWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("team-workload", raw);
  const { teamId, clamped } = resolveTeam(auth, cfg.teamId);
  const scope: Scope = { userId: null, teamId };
  const [dir, open, report, sessions] = await Promise.all([
    getDirectory(),
    openTasks(scope),
    timeReport(scope, cfg.range),
    openSessions(),
  ]);
  const people = dir.users.filter((u) => (teamId ? u.teamId === teamId : true));
  const tracked = new Map(report.byUser.map((u) => [u.key, u.tracked]));
  const working = new Set(sessions.map((s) => s.userId));
  const rows = people
    .map((u) => {
      const mine = open.filter((t) => t.task.assigneeId === u.id);
      return {
        id: u.id,
        name: u.name,
        open: mine.length,
        late: mine.filter((t) => t.hours !== null && t.hours < 0).length,
        tracked: tracked.get(`u${u.id}`) ?? 0,
        working: working.has(u.id),
      };
    })
    .sort((a, b) => b.late - a.late || b.open - a.open || b.tracked - a.tracked || a.name.localeCompare(b.name));
  const unassigned = open.filter((t) => !t.task.assigneeId);
  return (
    <>
      {clamped && <Narrowed />}
      {rows.length === 0 ? (
        <Note>No people here yet.</Note>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Person</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
                <th className="px-3 py-2 text-right font-medium">Late</th>
                <th className="py-2 pl-3 text-right font-medium">Tracked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">
                    <Link href={`/reports?user=${p.id}`} className="hover:underline">
                      {p.name}
                    </Link>
                    {p.working && (
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400" title="Has a task running">
                        ● working
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{p.open}</td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${p.late ? "text-red-700 dark:text-red-400" : "text-muted"}`}>{p.late}</td>
                  <td className="py-2 pl-3 text-right font-mono tabular-nums">{p.tracked ? fmtDuration(p.tracked) : "—"}</td>
                </tr>
              ))}
              {unassigned.length > 0 && (
                <tr>
                  <td className="py-2 pr-3 text-muted">Unassigned</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{unassigned.length}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                    {unassigned.filter((t) => t.hours !== null && t.hours < 0).length}
                  </td>
                  <td className="py-2 pl-3 text-right text-muted">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function WorkingNowWidget({ auth, raw }: { auth: Auth; raw: unknown }) {
  const cfg = parseConfig("working-now", raw);
  const { teamId, clamped } = resolveTeam(auth, cfg.teamId);
  const [dir, sessions] = await Promise.all([getDirectory(), openSessions()]);
  const rows = sessions
    .map((s) => ({ ...s, user: dir.userById.get(s.userId) }))
    .filter((s) => s.user && (teamId ? s.user.teamId === teamId : true))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  return (
    <>
      {clamped && <Narrowed />}
      {rows.length === 0 ? (
        <Note>Nobody has a task running.</Note>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((s) => (
            <li key={s.id} className="py-2 text-sm">
              <p className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{s.user!.name}</span>
                <span className="shrink-0 text-xs text-muted">since {fmtDateTime(s.startedAt, config.timeZone)}</span>
              </p>
              <p className="truncate text-xs text-muted">
                <Link href={`/tasks/${s.taskId}`} className="hover:underline" title={s.title}>
                  {truncate(s.title, 60)}
                </Link>
                {isSessionStale(s.startedAt) && <span className="ml-2 text-amber-700 dark:text-amber-400">open for a long time</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const STAGES = ["new", "contacted", "meeting", "proposal", "won", "lost"] as const;
const STAGE_LABEL = { new: "New", contacted: "Contacted", meeting: "Meeting", proposal: "Proposal", won: "Won", lost: "Lost" } as const;

async function LeadsWidget() {
  const leads = await db
    .select({ status: schema.leads.status, value: schema.leads.expectedMonthlyValue })
    .from(schema.leads);
  const byStage = STAGES.map((s) => {
    const mine = leads.filter((l) => l.status === s);
    return { stage: s, count: mine.length, value: mine.reduce((n, l) => n + (l.value ?? 0), 0) };
  });
  const open = byStage.filter((s) => s.stage !== "won" && s.stage !== "lost");
  const pipeline = open.reduce((n, s) => n + s.value, 0);
  const max = Math.max(1, ...byStage.map((s) => s.count));
  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stat label="Open leads" value={open.reduce((n, s) => n + s.count, 0)} />
        <Stat label="Pipeline / month" value={pipeline.toLocaleString("en-GB")} />
      </div>
      <ul className="space-y-2">
        {byStage.map((s) => (
          <li key={s.stage} className="text-sm">
            <div className="mb-1 flex justify-between gap-3">
              <span>{STAGE_LABEL[s.stage]}</span>
              <span className="font-mono tabular-nums">{s.count}</span>
            </div>
            <div className="h-2">
              <div className="h-full rounded-r-[4px]" style={{ width: `${s.count ? Math.max(2, (s.count / max) * 100) : 0}%`, background: "var(--series-1)" }} />
            </div>
          </li>
        ))}
      </ul>
      <ViewAll href="/leads">All leads →</ViewAll>
    </>
  );
}

// ---------------------------------------------------------------------------------------------

/** The content of one widget. Each widget loads its own data, so a slow one doesn't hold up the rest. */
export async function WidgetBody({ type, raw, auth }: { type: WidgetType; raw: unknown; auth: Auth }) {
  await connection();
  // A widget saved before the person's role changed may no longer be theirs to see.
  if (!WIDGETS[type].roles.includes(auth.role)) return <Note>This widget isn&apos;t available for your role.</Note>;
  switch (type) {
    case "tasks":
      return <TasksWidget auth={auth} raw={raw} />;
    case "task-counts":
      return <TaskCountsWidget auth={auth} raw={raw} />;
    case "stats":
      return <StatsWidget auth={auth} raw={raw} />;
    case "time-chart":
      return <TimeChartWidget auth={auth} raw={raw} />;
    case "time-breakdown":
      return <TimeBreakdownWidget auth={auth} raw={raw} />;
    case "clients":
      return <ClientsWidget auth={auth} raw={raw} />;
    case "team-workload":
      return <TeamWorkloadWidget auth={auth} raw={raw} />;
    case "working-now":
      return <WorkingNowWidget auth={auth} raw={raw} />;
    case "leads":
      return auth.role === "super_admin" ? <LeadsWidget /> : <Note>Only a super admin can see this widget.</Note>;
  }
}
