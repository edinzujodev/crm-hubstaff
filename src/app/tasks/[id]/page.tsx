import { DetailSkeleton } from "@/components/page-skeleton";
import { Crumb } from "@/components/crumb";
import { BackButton } from "@/components/back-button";
import { DataGrid } from "@/components/data-grid";
import { KIND_LABEL } from "@/lib/project-kind";
import { MoveTimeButton } from "@/components/move-time-button";
import { TabCard } from "@/components/tab-card";
import { InfoItem } from "@/components/info-item";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { RestoreTaskButton } from "@/components/restore-task-button";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { canManageTask, canViewTask, getAuth } from "@/lib/auth";
import { canReviewTask, reviewsByTask } from "@/lib/review";
import { ReviewHistory } from "@/components/review-history";
import { periodLabel } from "@/lib/recurring";
import { timeLeftLabel, urgencyOf } from "@/lib/urgency";
import { getLevels } from "@/lib/urgency-settings";
import { asc } from "drizzle-orm";
import { ReviewActions } from "@/components/review-actions";
import { TaskChecklist } from "@/components/task-checklist";
import { localDay } from "@/lib/format";
import { getCurrentUser } from "@/lib/current-user";
import { fmtDateTime, fmtDay, fmtDuration, fmtTime } from "@/lib/format";
import { getTaskReport, type SessionFlag } from "@/lib/report";

const endReasonLabel = {
  finished: "Finished",
  switched: "Switched task",
  auto_closed: "Auto-closed",
} as const;

function FlagText({ flag }: { flag: SessionFlag }) {
  switch (flag.kind) {
    case "open_too_long":
      return (
        <>
          Open for {flag.hours}h. Forgot to Stop? It will auto-close after{" "}
          {config.autoCloseSessionHours}h.
        </>
      );
    case "no_hubstaff_time":
      return (
        <>
          Hubstaff tracked nothing in this session. Was the timer running on
          this task?
        </>
      );
    case "partly_tracked":
      return (
        <>
          Hubstaff tracked {fmtDuration(flag.trackedSeconds)} of{" "}
          {fmtDuration(flag.openSeconds)} open (idle timeout or timer stopped).
        </>
      );
    case "auto_closed":
      return (
        <>Auto-closed at the last Hubstaff activity because it was left open.</>
      );
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

async function TaskDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const me = await getCurrentUser();
  const [row] = await db
    .select({
      task: schema.tasks,
      clientName: schema.clients.name,
      assigneeName: schema.users.name,
    })
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
  const [report, mine, checklist, reviewer, reviewMap] = await Promise.all([
    getTaskReport(id, tz),
    me
      ? db.query.workSessions.findFirst({
          where: and(
            eq(schema.workSessions.userId, me.id),
            isNull(schema.workSessions.endedAt),
          ),
        })
      : undefined,
    db
      .select()
      .from(schema.taskChecklistItems)
      .where(eq(schema.taskChecklistItems.taskId, id))
      .orderBy(
        asc(schema.taskChecklistItems.position),
        asc(schema.taskChecklistItems.id),
      ),
    task.reviewerId
      ? db.query.users.findFirst({
          where: eq(schema.users.id, task.reviewerId),
          columns: { name: true },
        })
      : null,
    reviewsByTask([id]),
  ]);
  const canReview = canReviewTask(auth, task);
  // Hours can be moved to another task of the same person, by that person or by someone who manages this task.
  const movable = (userId: number) =>
    !task.deletedAt && (userId === auth.user.id || manage);
  const sessionUsers = [
    ...new Set(
      report.sessions
        .filter((x) => x.endedAt && movable(x.userId))
        .map((x) => x.userId),
    ),
  ];
  const targetRows = sessionUsers.length
    ? await db
        .select({
          id: schema.tasks.id,
          title: schema.tasks.title,
          assigneeId: schema.tasks.assigneeId,
          status: schema.tasks.status,
          repeat: schema.tasks.repeat,
          dueDate: schema.tasks.dueDate,
        })
        .from(schema.tasks)
        .where(
          and(
            inArray(schema.tasks.assigneeId, sessionUsers),
            isNull(schema.tasks.deletedAt),
            ne(schema.tasks.id, id),
          ),
        )
        .orderBy(asc(schema.tasks.status), desc(schema.tasks.id))
    : [];
  const project = task.projectId
    ? await db.query.projects.findFirst({
        where: eq(schema.projects.id, task.projectId),
      })
    : null;
  const today = localDay(new Date(), tz);
  const team = task.teamId
    ? await db.query.teams.findFirst({
        where: eq(schema.teams.id, task.teamId),
      })
    : null;
  const urgency = task.deletedAt
    ? null
    : urgencyOf(task, await getLevels(), tz);
  const waiting =
    !!task.startDate &&
    task.startDate > localDay(new Date(), tz) &&
    task.status !== "done";
  const otherTask =
    mine && mine.taskId !== id
      ? await db.query.tasks.findFirst({
          where: eq(schema.tasks.id, mine.taskId),
          columns: { id: true, title: true },
        })
      : null;

  const statusLabel = task.deletedAt
    ? "Deleted"
    : task.status === "done"
      ? "Done"
      : task.status === "review"
        ? "On review"
        : task.status === "in_progress"
          ? "In progress"
          : "Open";
  const reviews = reviewMap.get(id) ?? [];
  const wanted = (await searchParams).tab;
  const tabList = [
    { key: "checklist", label: "Checklist" },
    { key: "time", label: "Time" },
    { key: "reviews", label: "Reviews", count: reviews.length },
  ];
  const activeTab = Math.max(
    0,
    tabList.findIndex((t) => t.key === wanted),
  );
  const tab = tabList[activeTab].key;

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallback="/tasks" />
      </div>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Crumb
              name={
                task.repeat && task.dueDate
                  ? periodLabel(task.repeat, task.dueDate)
                  : task.title
              }
            />
            <h1 className="text-xl font-semibold">
              {task.repeat && task.dueDate
                ? periodLabel(task.repeat, task.dueDate)
                : task.title}
            </h1>
            <span className="badge">{statusLabel}</span>
          </div>
          {task.repeat && task.dueDate && (
            <p className="text-sm text-muted">
              {task.seriesId ? (
                <Link
                  href={`/recurring/${task.seriesId}`}
                  className="underline hover:text-foreground"
                  title="Open the recurring task: all copies, stop repeating, delete"
                >
                  {task.title}
                </Link>
              ) : (
                task.title
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {task.deletedAt ? (
            <RestoreTaskButton taskId={task.id} />
          ) : (
            <>
              {manage && (
                <div className="flex items-center gap-2">
                  <DeleteTaskButton
                    taskId={task.id}
                    title={task.title}
                    redirectTo="/tasks"
                  />
                </div>
              )}
              {manage && (
                <span
                  aria-hidden
                  className="hidden h-8 w-px bg-border sm:block"
                />
              )}
              <TimerControls
                taskId={task.id}
                title={task.title}
                lockedTo={
                  task.assigneeId && task.assigneeId !== me?.id
                    ? (row.assigneeName ?? "someone else")
                    : null
                }
                done={task.status === "done" || task.status === "review"}
                runningSince={
                  mine?.taskId === id ? mine.startedAt.toISOString() : null
                }
                otherTask={otherTask ?? null}
              />
            </>
          )}
        </div>
      </section>

      {(urgency === "critical" || urgency === "approaching") &&
        task.dueDate && (
          <div
            role="alert"
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
              urgency === "critical"
                ? "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-300"
                : "border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            }`}
          >
            <i aria-hidden className="pi pi-exclamation-triangle text-base" />
            <span>
              <span className="font-semibold">
                {urgency === "critical" ? "Critical." : "Approaching."}
              </span>{" "}
              {timeLeftLabel(task.dueDate, tz)}
            </span>
          </div>
        )}

      <section className="card grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3">
        <InfoItem icon="pi-tag" label="Kind of task">
          {task.repeat
            ? task.repeat === "weekly"
              ? "Weekly, repeats"
              : "Monthly, repeats"
            : "One-time"}
        </InfoItem>
        <InfoItem icon="pi-briefcase" label="Client">
          {task.clientId ? (
            <Link
              href={`/clients/${task.clientId}`}
              className="hover:underline"
            >
              {row.clientName}
            </Link>
          ) : (
            "—"
          )}
        </InfoItem>
        <InfoItem icon="pi-folder" label="Project">
          {project ? `${project.name} · ${KIND_LABEL[project.kind]}` : "—"}
        </InfoItem>
        <InfoItem icon="pi-users" label="Team">
          {team?.name ?? "—"}
        </InfoItem>
        <InfoItem icon="pi-user" label="Assignee">
          {row.assigneeName ?? "Unassigned"}
        </InfoItem>
        <InfoItem icon="pi-calendar" label="Due">
          {task.dueDate
            ? fmtDay(task.dueDate) +
              (task.dueDate.slice(0, 4) !== today.slice(0, 4)
                ? ` ${task.dueDate.slice(0, 4)}`
                : "")
            : "—"}
        </InfoItem>
      </section>

      {waiting && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
          <span>
            This copy is waiting for its start date ({task.startDate}); it is
            hidden from the open lists until then.
          </span>
        </div>
      )}

      {task.status === "review" && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-500/50 p-3 text-sm">
          <span>
            <span className="font-medium">On review.</span>{" "}
            {reviewer
              ? `${reviewer.name} will approve it or send it back with a reason.`
              : "Waiting for the team leader."}
          </span>
          {canReview && <ReviewActions taskId={task.id} title={task.title} />}
        </div>
      )}

      {task.reviewResult === "rejected" && task.status === "todo" && (
        <div className="card space-y-1 border-red-500/50 p-3 text-sm">
          <p className="font-medium text-red-600 dark:text-red-400">
            Checked: not OK
          </p>
          <p className="whitespace-pre-wrap">{task.reviewNote}</p>
          <p className="text-xs text-muted">
            Fix it and press Finish again to send it back for review.
          </p>
        </div>
      )}

      {task.reviewResult === "approved" && task.status === "done" && (
        <p className="card border-emerald-500/50 p-3 text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            Checked: OK
          </span>
          {task.reviewedAt && (
            <span className="text-muted">
              {" "}
              · {fmtDateTime(task.reviewedAt, tz)}
            </span>
          )}
          {task.reviewNote && <span> — {task.reviewNote}</span>}
        </p>
      )}

      {task.deletedAt && (
        <p className="card border-red-500/40 p-3 text-sm">
          This task was deleted on {fmtDateTime(task.deletedAt, tz)}. It is
          hidden from the task list and can&apos;t be started. Its Hubstaff task
          is marked [SOFT-DELETED], and the hours below still count in reports.
          Restore it to use it again.
        </p>
      )}

      <TabCard
        padded
        active={activeTab}
        tabs={tabList.map((t) => ({
          label: t.label,
          count: "count" in t ? t.count : undefined,
          href:
            t.key === "checklist"
              ? `/tasks/${id}`
              : `/tasks/${id}?tab=${t.key}`,
        }))}
      >
        <div className="space-y-6">
          {tab === "checklist" && (
            <TaskChecklist
              taskId={task.id}
              description={task.description}
              items={checklist.map((c) => ({
                id: c.id,
                text: c.text,
                done: c.doneAt !== null,
              }))}
              canEdit={manage && !task.deletedAt}
              canTick={!task.deletedAt && task.status !== "done"}
            />
          )}

          {tab === "time" && (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="card p-4">
                  <p className="text-xs text-muted">Tracked in Hubstaff</p>
                  <p className="mt-1 font-mono text-2xl tabular-nums">
                    {fmtDuration(report.trackedSeconds)}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted">Activity</p>
                  <p className="mt-1 font-mono text-2xl tabular-nums">
                    {report.activityPercent === null
                      ? "—"
                      : `${report.activityPercent}%`}
                  </p>
                </div>
                <div className="card p-4">
                  <p className="text-xs text-muted">Last tracked</p>
                  <p className="mt-1 text-lg">
                    {report.lastActivityAt
                      ? fmtDateTime(report.lastActivityAt, tz)
                      : "—"}
                  </p>
                </div>
              </section>

              {report.outsideSessionsSeconds > 0 && (
                <p className="text-sm text-muted">
                  {fmtDuration(report.outsideSessionsSeconds)} of this was
                  tracked in the Hubstaff app without Start in the CRM. It still
                  counts toward the task.
                </p>
              )}

              <section className="space-y-2">
                <h2 className="font-semibold">Sessions</h2>
                <DataGrid
                  empty="No sessions yet. Click Start to begin."
                  headers={[
                    "Who",
                    "Start → Finish",
                    { label: "Session length", align: "right" },
                    { label: "Tracked in Hubstaff", align: "right" },
                    "Notes",
                  ]}
                  actionsWidth="9rem"
                  rows={report.sessions.map((s) => ({
                    key: s.id,
                    cells: [
                      s.userName,
                      <span key="w" className="whitespace-nowrap">
                        {fmtDateTime(s.startedAt, tz)} →{" "}
                        {s.endedAt ? (
                          fmtTime(s.endedAt, tz)
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            running
                          </span>
                        )}
                        {s.endReason && (
                          <span className="ml-2 text-xs text-muted">
                            {endReasonLabel[s.endReason]}
                          </span>
                        )}
                      </span>,
                      <span
                        key="o"
                        className="font-mono tabular-nums text-muted"
                      >
                        {fmtDuration(s.openSeconds)}
                      </span>,
                      <span key="h" className="font-mono tabular-nums">
                        {fmtDuration(s.trackedSeconds)}
                      </span>,
                      <div
                        key="n"
                        className="text-xs text-amber-700 dark:text-amber-400"
                      >
                        {s.flags.map((f, i) => (
                          <p key={i}>
                            <FlagText flag={f} />
                          </p>
                        ))}
                      </div>,
                    ],
                    actions:
                      s.endedAt && movable(s.userId) ? (
                        <MoveTimeButton
                          sessionId={s.id}
                          summary={`${s.userName} · ${fmtDateTime(s.startedAt, tz)} → ${fmtTime(s.endedAt, tz)} · ${fmtDuration(s.trackedSeconds || s.openSeconds)}`}
                          targets={targetRows
                            .filter((t) => t.assigneeId === s.userId)
                            .map((t) => ({
                              id: t.id,
                              title: t.title,
                              label: [
                                t.repeat && t.dueDate
                                  ? periodLabel(t.repeat, t.dueDate)
                                  : "",
                                t.status === "done"
                                  ? "Done"
                                  : t.status === "review"
                                    ? "On review"
                                    : "",
                              ]
                                .filter(Boolean)
                                .join(" · "),
                            }))}
                        />
                      ) : null,
                  }))}
                />
                <p className="text-xs text-muted">
                  Session length is how long Start was on. Tracked in Hubstaff
                  is what Hubstaff counted in that time (idle time is left out).
                  Tracked on the wrong task? Use Move hours on the session.
                </p>
              </section>

              {(report.byUser.length > 1 || report.byDay.length > 1) && (
                <section className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <h2 className="font-semibold">By person</h2>
                    <TotalsTable
                      rows={report.byUser.map((r) => ({ label: r.name, ...r }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <h2 className="font-semibold">By day</h2>
                    <TotalsTable
                      rows={report.byDay.map((r) => ({ label: r.day, ...r }))}
                    />
                  </div>
                </section>
              )}
            </>
          )}

          {tab === "reviews" && (
            <>
              <section className="card grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-4">
                <InfoItem icon="pi-plus-circle" label="Created">
                  {fmtDateTime(task.createdAt, tz)}
                </InfoItem>
                <InfoItem icon="pi-check" label="Finished">
                  {task.doneAt ? fmtDateTime(task.doneAt, tz) : "—"}
                </InfoItem>
                <InfoItem icon="pi-check-circle" label="Reviewed by">
                  {reviewer?.name ?? "—"}
                </InfoItem>
                <InfoItem icon="pi-clock" label="Hubstaff">
                  {task.hubstaffTaskId ? (
                    `Task #${task.hubstaffTaskId}`
                  ) : (
                    <span
                      className="text-muted"
                      title="It is created in Hubstaff the first time you press Start"
                    >
                      Not created yet
                    </span>
                  )}
                </InfoItem>
              </section>
              {reviews.length > 0 ? (
                <section className="card space-y-3 p-4">
                  <h2 className="font-semibold">
                    Review history{" "}
                    <span className="text-sm font-normal text-muted">
                      {reviews.length}
                    </span>
                  </h2>
                  <ReviewHistory reviews={reviews} tz={tz} />
                </section>
              ) : (
                <p className="text-sm text-muted">
                  Nobody has checked this task yet.
                </p>
              )}
            </>
          )}
        </div>
      </TabCard>
    </div>
  );
}

function TotalsTable({
  rows,
}: {
  rows: { label: string; tracked: number; active: number }[];
}) {
  return (
    <DataGrid
      noHeader
      empty="No tracked time yet."
      headers={[
        "",
        { label: "", align: "right" },
        { label: "", align: "right" },
      ]}
      rows={rows.map((r) => ({
        key: r.label,
        cells: [
          r.label,
          <span key="t" className="font-mono tabular-nums">
            {fmtDuration(r.tracked)}
          </span>,
          <span key="a" className="text-xs text-muted">
            {r.tracked ? Math.round((r.active / r.tracked) * 100) : 0}% active
          </span>,
        ],
      }))}
    />
  );
}

export default function TaskPage({
  params,
  searchParams,
}: PageProps<"/tasks/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TaskDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
