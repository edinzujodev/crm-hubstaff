import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { StopRepeatingButton } from "@/components/stop-repeating-button";
import { RestoreTaskButton } from "@/components/restore-task-button";
import { TaskStatusSelect } from "@/components/task-status-select";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { canManageTask, canViewTask, getAuth } from "@/lib/auth";
import { canReviewTask } from "@/lib/review";
import { nextHidden, periodLabel, upcomingCopies } from "@/lib/recurring";
import { asc } from "drizzle-orm";
import { ReviewActions } from "@/components/review-actions";
import { NextPeriodButton } from "@/components/next-period-button";
import { TaskChecklist } from "@/components/task-checklist";
import { localDay } from "@/lib/format";
import { getCurrentUser } from "@/lib/current-user";
import { fmtDateTime, fmtDuration, fmtTime } from "@/lib/format";
import { getTaskReport, type SessionFlag } from "@/lib/report";

const endReasonLabel = { finished: "Finished", switched: "Switched task", auto_closed: "Auto-closed" } as const;

function FlagText({ flag }: { flag: SessionFlag }) {
  switch (flag.kind) {
    case "open_too_long":
      return <>Open for {flag.hours}h. Forgot to Stop? It will auto-close after {config.autoCloseSessionHours}h.</>;
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
  const auth = await getAuth();
  if (!auth || !canViewTask(auth, task)) notFound();
  const manage = canManageTask(auth, task);

  const tz = config.timeZone;
  const [report, mine, checklist, reviewer] = await Promise.all([
    getTaskReport(id, tz),
    me
      ? db.query.workSessions.findFirst({
          where: and(eq(schema.workSessions.userId, me.id), isNull(schema.workSessions.endedAt)),
        })
      : undefined,
    db.select().from(schema.taskChecklistItems).where(eq(schema.taskChecklistItems.taskId, id)).orderBy(asc(schema.taskChecklistItems.position), asc(schema.taskChecklistItems.id)),
    task.reviewerId ? db.query.users.findFirst({ where: eq(schema.users.id, task.reviewerId), columns: { name: true } }) : null,
  ]);
  const canReview = canReviewTask(auth, task);
  const waiting = !!task.startDate && task.startDate > localDay(new Date(), tz) && task.status !== "done";
  const next =
    manage && task.repeat && task.seriesId && !task.deletedAt && !waiting
      ? nextHidden((await upcomingCopies([task.seriesId], localDay(new Date(), tz))).get(task.seriesId), task.dueDate)
      : null;
  const otherTask =
    mine && mine.taskId !== id
      ? await db.query.tasks.findFirst({ where: eq(schema.tasks.id, mine.taskId), columns: { id: true, title: true } })
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{task.title}</h1>
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
            {task.repeat && (
              <span>
                Repeats {task.repeat}{manage && <> · <StopRepeatingButton taskId={task.id} /></>}
              </span>
            )}
            {task.seriesId && (
              <Link href={`/recurring/${task.seriesId}`} className="underline">
                See all occurrences →
              </Link>
            )}
            <span>{task.hubstaffTaskId ? `Hubstaff task #${task.hubstaffTaskId}` : "Not in Hubstaff yet (created on first Start)"}</span>
          </p>
        </div>
        <div className="flex items-start gap-3">
          {task.deletedAt ? (
            <RestoreTaskButton taskId={task.id} />
          ) : (
            <>
              <TaskStatusSelect taskId={task.id} title={task.title} status={task.status} />
              {manage && <DeleteTaskButton taskId={task.id} title={task.title} redirectTo="/tasks" />}
              <TimerControls
                taskId={task.id}
                title={task.title}
                lockedTo={task.assigneeId && task.assigneeId !== me?.id ? (row.assigneeName ?? "someone else") : null}
                done={task.status === "done" || task.status === "review"}
                runningSince={mine?.taskId === id ? mine.startedAt.toISOString() : null}
                otherTask={otherTask ?? null}
              />
            </>
          )}
        </div>
      </div>

      {next && task.repeat && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <span>
            The next one ({periodLabel(task.repeat, next.dueDate)}) shows up on its own when its time comes. Need it
            earlier?
          </span>
          <NextPeriodButton nextTaskId={next.id} label={periodLabel(task.repeat, next.dueDate)} />
        </div>
      )}

      {waiting && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <span>This copy is waiting for its start date ({task.startDate}); it is hidden from the open lists until then.</span>
        </div>
      )}

      {task.status === "review" && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-500/50 p-3 text-sm">
          <span>
            <span className="font-medium">On review.</span>{" "}
            {reviewer ? `${reviewer.name} will approve it or send it back with a reason.` : "Waiting for the team leader."}
          </span>
          {canReview && <ReviewActions taskId={task.id} title={task.title} />}
        </div>
      )}

      {task.reviewResult === "rejected" && task.status === "todo" && (
        <div className="card space-y-1 border-red-500/50 p-3 text-sm">
          <p className="font-medium text-red-700 dark:text-red-400">Checked: not OK</p>
          <p className="whitespace-pre-wrap">{task.reviewNote}</p>
          <p className="text-xs text-muted">Fix it and press Finish again to send it back for review.</p>
        </div>
      )}

      {task.reviewResult === "approved" && task.status === "done" && (
        <p className="card border-emerald-500/50 p-3 text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Checked: OK</span>
          {task.reviewedAt && <span className="text-muted"> · {fmtDateTime(task.reviewedAt, tz)}</span>}
          {task.reviewNote && <span> — {task.reviewNote}</span>}
        </p>
      )}

      {task.deletedAt && (
        <p className="card border-red-500/40 p-3 text-sm">
          This task was deleted on {fmtDateTime(task.deletedAt, tz)}. It is hidden from the task list and can&apos;t be
          started. Its Hubstaff task is marked [SOFT-DELETED], and the hours below still count in reports. Restore it to
          use it again.
        </p>
      )}

      <TaskChecklist
        taskId={task.id}
        description={task.description}
        items={checklist.map((c) => ({ id: c.id, text: c.text, done: c.doneAt !== null }))}
        canEdit={manage && !task.deletedAt}
        canTick={!task.deletedAt && task.status !== "done"}
      />

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
