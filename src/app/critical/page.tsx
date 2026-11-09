import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { pageGuard, taskScope } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtDay, localDay, truncate } from "@/lib/format";
import {
  DEFAULT_LEVELS,
  URGENCY_CLASS,
  URGENCY_LABEL,
  hoursUntilDue,
  timeLeftLabel,
  urgencyOf,
  type Urgency,
} from "@/lib/urgency";

type Row = {
  id: number;
  title: string;
  clientName: string | null;
  assigneeName: string | null;
  teamName: string | null;
  dueDate: string;
  hours: number;
  status: "todo" | "in_progress" | "done";
};

function Table({ rows, level, showTeam }: { rows: Row[]; level: Urgency; showTeam: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Assignee</th>
            {showTeam && <th className="px-3 py-2 font-medium">Team</th>}
            <th className="px-3 py-2 font-medium">Due</th>
            <th className="px-3 py-2 font-medium">Time left</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/tasks/${r.id}`} className="font-medium hover:underline" title={r.title}>
                  {truncate(r.title, 50)}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">{r.clientName ?? "—"}</td>
              <td className="px-3 py-2">
                {r.assigneeName ?? <span className="badge border-amber-500/60 text-amber-700 dark:text-amber-400">Unassigned</span>}
              </td>
              {showTeam && <td className="px-3 py-2 text-muted">{r.teamName ?? "—"}</td>}
              <td className="px-3 py-2">{fmtDay(r.dueDate)}</td>
              <td className="px-3 py-2">
                <span className={`badge ${URGENCY_CLASS[level]}`}>{timeLeftLabel(r.dueDate, config.timeZone)}</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={showTeam ? 6 : 5} className="px-3 py-6 text-center text-muted">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function CriticalTasks() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const [tasks, teams] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        clientName: schema.clients.name,
        assigneeName: schema.users.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
      .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
      .where(and(isNull(schema.tasks.deletedAt), ne(schema.tasks.status, "done"), taskScope(auth)))
      .orderBy(asc(schema.tasks.dueDate)),
    db.select().from(schema.teams),
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const now = new Date();
  const today = localDay(now, config.timeZone);

  const critical: Row[] = [];
  const approaching: Row[] = [];
  for (const { task, clientName, assigneeName } of tasks) {
    // A repeat copy that has not reached its start date is not active yet.
    if (!task.dueDate || (task.startDate && task.startDate > today)) continue;
    const team = task.teamId ? teamById.get(task.teamId) : undefined;
    const level = urgencyOf(task, team ?? DEFAULT_LEVELS, config.timeZone, now);
    if (level !== "critical" && level !== "approaching") continue;
    (level === "critical" ? critical : approaching).push({
      id: task.id,
      title: task.title,
      clientName,
      assigneeName,
      teamName: team?.name ?? null,
      dueDate: task.dueDate,
      hours: hoursUntilDue(task.dueDate, config.timeZone, now),
      status: task.status,
    });
  }
  const byHours = (a: Row, b: Row) => a.hours - b.hours;
  critical.sort(byHours);
  approaching.sort(byHours);
  const showTeam = auth.role === "super_admin";
  const ownTeam = auth.role === "leader" ? auth.ledTeam : null;
  const levels = ownTeam ?? DEFAULT_LEVELS;

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        {ownTeam ? `${ownTeam.name}: ` : ""}
        {ownTeam
          ? `Critical means due in under ${levels.criticalHours}h or overdue. Approaching means under ${levels.approachingHours}h. You can change these on the Team page.`
          : "Critical means overdue or due within the team's critical hours (24h unless the team changed it). Each team sets its own levels on the Team page."}
      </p>
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className={`badge ${URGENCY_CLASS.critical}`}>{URGENCY_LABEL.critical}</span>
          <span className="text-muted">{critical.length}</span>
        </h2>
        <Table rows={critical} level="critical" showTeam={showTeam} />
      </section>
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <span className={`badge ${URGENCY_CLASS.approaching}`}>{URGENCY_LABEL.approaching}</span>
          <span className="text-muted">{approaching.length}</span>
        </h2>
        <Table rows={approaching} level="approaching" showTeam={showTeam} />
      </section>
    </div>
  );
}

export default function CriticalPage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Critical tasks</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CriticalTasks />
      </Suspense>
    </div>
  );
}
