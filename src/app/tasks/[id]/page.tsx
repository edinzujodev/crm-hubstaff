import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { TaskStatusSelect } from "@/components/task-status-select";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/current-user";
import { fmtDateTime, fmtDuration, fmtTime } from "@/lib/format";
import { getTaskReport, type SessionFlag } from "@/lib/report";

const endReasonLabel = { finished: "Finished", switched: "Switched task", auto_closed: "Auto-closed" } as const;

function FlagText({ flag }: { flag: SessionFlag }) {
  switch (flag.kind) {
    case "open_too_long":
      return <>Open for {flag.hours}h. Forgot to Finish? It will auto-close after {config.autoCloseSessionHours}h.</>;
    case "no_hubstaff_time":
      return <>Hubstaff tracked nothing in this session. Was the timer running on this task?</>;
    case "partly_tracked":
      return (
        <>
          Hubstaff tracked {fmtDuration(flag.trackedSeconds)} of {fmtDuration(flag.openSeconds)} open (idle timeout or
          timer stopped).
        </>
      );
    case "auto_closed":
      return <>Auto-closed at the last Hubstaff activity because it was left open.</>;
    case "overlaps":
      return (
        <>
          Overlaps a session on{" "}
          <Link className="underline" href={`/tasks/${flag.otherTaskId}`}>
            {flag.otherTaskTitle}
          </Link>
          .
        </>
      );
  }
}

async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const me = await getCurrentUser();
  const [row] = await db
    .select({ task: schema.tasks, clientName: schema.clients.name, assigneeName: schema.users.name })
    .from(schema.tasks)
    .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
    .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
    .where(eq(schema.tasks.id, id));
  if (!row) notFound();
  const { task } = row;

  const tz = config.timeZone;
  const [report, mine] = await Promise.all([
    getTaskReport(id, tz),
    me
      ? db.query.workSessions.findFirst({
          where: and(eq(schema.workSessions.userId, me.id), isNull(schema.workSessions.endedAt)),
        })
      : undefined,
  ]);
  const otherTask =
    mine && mine.taskId !== id
      ? await db.query.tasks.findFirst({ where: eq(schema.tasks.id, mine.taskId), columns: { id: true, title: true } })
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-muted hover:underline">
            ← Tasks
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{task.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
            <span>
              Client:{" "}
              {task.clientId ? (
                <Link href={`/clients/${task.clientId}`} className="underline">
                  {row.clientName}
                </Link>
              ) : (
                "—"
              )}
            </span>
            <span>Assignee: {row.assigneeName ?? "—"}</span>
            {task.dueDate && <span>Due: {task.dueDate}</span>}
            <span>{task.hubstaffTaskId ? `Hubstaff task #${task.hubstaffTaskId}` : "Not in Hubstaff yet (created on first Start)"}</span>
          </p>
        </div>
        <div className="flex items-start gap-3">
          <TaskStatusSelect taskId={task.id} status={task.status} />
          <DeleteTaskButton taskId={task.id} title={task.title} redirectTo="/" />
          <TimerControls
            taskId={task.id}
            done={task.status === "done"}
            runningSince={mine?.taskId === id ? mine.startedAt.toISOString() : null}
            otherTask={otherTask ?? null}
          />
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Tracked in Hubstaff</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{fmtDuration(report.trackedSeconds)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Activity</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {report.activityPercent === null ? "—" : `${report.activityPercent}%`}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Last tracked</p>
          <p className="mt-1 text-lg">{report.lastActivityAt ? fmtDateTime(report.lastActivityAt, tz) : "—"}</p>
        </div>
      </section>

      {report.outsideSessionsSeconds > 0 && (
        <p className="text-sm text-muted">
          {fmtDuration(report.outsideSessionsSeconds)} of this was tracked in the Hubstaff app without Start in the CRM.
          It still counts toward the task.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Sessions</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Start → Finish</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
                <th className="px-3 py-2 text-right font-medium">Hubstaff</th>
                <th className="px-3 py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.sessions.map((s) => (
                <tr key={s.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2">{s.userName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fmtDateTime(s.startedAt, tz)} → {s.endedAt ? fmtTime(s.endedAt, tz) : <span className="text-emerald-700 dark:text-emerald-400">running</span>}
                    {s.endReason && <span className="ml-2 text-xs text-muted">{endReasonLabel[s.endReason]}</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">{fmtDuration(s.openSeconds)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtDuration(s.trackedSeconds)}</td>
                  <td className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {s.flags.map((f, i) => (
                      <p key={i}>
                        <FlagText flag={f} />
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
              {report.sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted">
                    No sessions yet. Click Start to begin.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Sessions are what was clicked in the CRM. Hours always come from Hubstaff, and several sessions on one task are
          added up.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-semibold">By person</h2>
          <TotalsTable rows={report.byUser.map((r) => ({ label: r.name, ...r }))} />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">By day</h2>
          <TotalsTable rows={report.byDay.map((r) => ({ label: r.day, ...r }))} />
        </div>
      </section>
    </div>
  );
}

function TotalsTable({ rows }: { rows: { label: string; tracked: number; active: number }[] }) {
  return (
    <div className="card">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtDuration(r.tracked)}</td>
              <td className="px-3 py-2 text-right text-xs text-muted">
                {r.tracked ? Math.round((r.active / r.tracked) * 100) : 0}% active
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-center text-muted">No tracked time yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <TaskDetail params={params} />
    </Suspense>
  );
}
