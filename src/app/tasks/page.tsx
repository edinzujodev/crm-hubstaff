import { ListSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { cookies } from "next/headers";
import { TaskScopeToggle } from "@/components/task-scope-toggle";
import { ApprovedBadge, BlockedBadge, OnReviewBadge, ReturnedBadge } from "@/components/approved-badge";
import { SeriesStateFilter } from "@/components/series-state-filter";
import { TaskPeopleFilter } from "@/components/task-people-filter";
import { SERIES_STATES, type SeriesState } from "@/lib/series-state";
import {
  TASK_SCOPE_COOKIE,
  TASK_SCOPES,
  type TaskScope,
} from "@/lib/task-scope";
import { Fragment, Suspense } from "react";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { TaskChecklist } from "@/components/task-checklist";
import { ReopenTaskButton } from "@/components/reopen-task-button";
import { PurgeTaskButton } from "@/components/purge-task-button";
import { RestoreTaskButton } from "@/components/restore-task-button";
import { NewTaskForm } from "@/components/new-task-form";
import { SeriesMenu } from "@/components/series-menu";
import { TaskMenu } from "@/components/task-menu";
import { DataGrid } from "@/components/data-grid";
import { TabCard } from "@/components/tab-card";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { assignableUsers, canManageTask, pageGuard, taskScope } from "@/lib/auth";
import { canReviewTask } from "@/lib/review";
import { ReviewActions } from "@/components/review-actions";
import { NextPeriodButton } from "@/components/next-period-button";
import {
  fmtDateTime,
  fmtDay,
  fmtDuration,
  fmtSpan,
  spanSince,
  localDay,
  truncate,
} from "@/lib/format";
import { isSessionStale } from "@/lib/report";
import { KIND_LABEL } from "@/lib/project-kind";
import { listSeries } from "@/lib/series";
import { listTemplates } from "@/lib/templates";
import { nextHidden, periodLabel, taskName, upcomingCopies } from "@/lib/recurring";
import { Avatar } from "@/components/avatar";
import { InlineChecklist } from "@/components/inline-checklist";
import { getLevels } from "@/lib/urgency-settings";
import { hoursUntilDue, timeLeftLabel, urgencyOf } from "@/lib/urgency";

const TITLE_MAX = 50;
const repeatLabel = { weekly: "Weekly", monthly: "Monthly" } as const;

/** W weekly, M monthly, O one-time: a small coloured letter, with the full word on hover. */
function TypeChip({ repeat }: { repeat: "weekly" | "monthly" | null }) {
  const [letter, word, tone] =
    repeat === "weekly"
      ? ["W", "Weekly", "bg-sky-500/15 text-sky-700 dark:text-sky-300"]
      : repeat === "monthly"
        ? [
            "M",
            "Monthly",
            "bg-violet-500/15 text-violet-700 dark:text-violet-300",
          ]
        : ["O", "One-time", "bg-black/5 text-muted dark:bg-white/10"];
  return (
    <span
      title={word}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold ${tone}`}
    >
      {letter}
      <span className="sr-only"> {word}</span>
    </span>
  );
}

type SeriesEdit = {
  clients: { id: number; name: string }[];
  users: { id: number; name: string }[];
  projects: React.ComponentProps<typeof NewTaskForm>["projects"];
  taskOf: (
    id: number,
  ) => React.ComponentProps<typeof SeriesMenu>["task"] | null;
};

function SeriesTable({
  series,
  state,
  edit,
}: {
  series: Awaited<ReturnType<typeof listSeries>>;
  state: SeriesState;
  edit: SeriesEdit;
}) {
  const today = localDay(new Date(), config.timeZone);
  return (
    <DataGrid
      flush
      alwaysSearch
      toolbar={<SeriesStateFilter state={state} />}
      empty={
        state === "stopped" ? (
          "No stopped recurring tasks."
        ) : state === "active" ? (
          "No recurring tasks that are still repeating. Add a task and set its type to Weekly or Monthly."
        ) : (
          "No recurring tasks yet. Add a task and set its type to Weekly or Monthly."
        )
      }
      headers={[
        "Task",
        "Client",
        "Repeats",
        { label: "Done", align: "right" },
        { label: "Total time", align: "right" },
        "Next due",
      ]}
      rows={series.map((s) => {
        const task = edit.taskOf(s.latestTaskId);
        const history = [...s.history].reverse();
        return {
          key: s.id,
          cells: [
            <Link
              key="t"
              href={`/recurring/${s.id}`}
              className="font-medium hover:underline"
            >
              {s.title}
            </Link>,
            s.clientId ? (
              <Link
                key="c"
                href={`/clients/${s.clientId}`}
                className="text-muted hover:underline"
              >
                {s.clientName}
              </Link>
            ) : (
              "—"
            ),
            s.repeat ? (
              <span key="r" className="badge">
                {repeatLabel[s.repeat]}
              </span>
            ) : (
              <span key="r" className="badge text-muted">
                Stopped
              </span>
            ),
            <span key="d" className="font-mono tabular-nums">
              {s.done} / {s.occurrences}
            </span>,
            <span key="tt" className="font-mono tabular-nums">
              {s.trackedSeconds ? fmtDuration(s.trackedSeconds) : "—"}
            </span>,
            <span key="n" className="text-muted">
              {s.nextDue ? fmtDay(s.nextDue) : "—"}
            </span>,
          ],
          actions: task ? (
            <SeriesMenu
              seriesId={s.id}
              task={task}
              clients={edit.clients}
              users={edit.users}
              projects={edit.projects}
            />
          ) : null,
          details: (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted">
                  {s.occurrences} {s.occurrences === 1 ? "copy" : "copies"} ·{" "}
                  {s.done} finished · newest first
                </p>
                <Link href={`/recurring/${s.id}`} className="text-sm underline">
                  Open full history →
                </Link>
              </div>
              <DataGrid
                plain
                headers={[
                  "Period",
                  "Due",
                  "Status",
                  "Assignee",
                  "Finished",
                  { label: "Time", align: "right" },
                ]}
                rows={history.map((o) => ({
                  key: o.id,
                  cells: [
                    <div key="p">
                      <Link
                        href={`/tasks/${o.id}`}
                        className="font-medium hover:underline"
                      >
                        {s.repeat && o.dueDate
                          ? periodLabel(s.repeat, o.dueDate)
                          : o.title}
                      </Link>
                      {o.startDate &&
                        o.startDate > today &&
                        o.status !== "done" && (
                          <span className="badge ml-2 text-muted">
                            Starts {fmtDay(o.startDate)}
                          </span>
                        )}
                      {o.checklist.length > 0 && o.status !== "done" && (
                        <div className="mt-1">
                          <InlineChecklist items={o.checklist} canTick />
                        </div>
                      )}
                    </div>,
                    <span key="due" className="text-muted">
                      {o.dueDate ? fmtDay(o.dueDate) : "—"}
                    </span>,
                    <span key="s" className="badge">
                      {o.status === "done"
                        ? "Done"
                        : o.status === "review"
                          ? "On review"
                          : o.status === "in_progress"
                            ? "In progress"
                            : "Open"}
                    </span>,
                    <span key="a" className="text-muted">
                      {o.assigneeName ?? "—"}
                    </span>,
                    <span key="f" className="text-muted">
                      {o.doneAt ? fmtDateTime(o.doneAt, config.timeZone) : "—"}
                    </span>,
                    <span key="tm" className="font-mono tabular-nums">
                      {o.trackedSeconds ? fmtDuration(o.trackedSeconds) : "—"}
                    </span>,
                  ],
                }))}
              />
            </div>
          ),
        };
      })}
    />
  );
}

async function TaskList({
  filter,
}: {
  filter: Promise<{ show?: string; scope?: string; state?: string; team?: string; person?: string }>;
}) {
  const [auth, { show, scope: scopeParam, state: stateParam, team: teamParam, person: personParam }] = await Promise.all([
    pageGuard(),
    filter,
  ]);
  const me = auth.user;
  const [tasks, clients, users, openSessions, projects, series, templates] =
    await Promise.all([
      db
        .select({
          task: schema.tasks,
          clientName: schema.clients.name,
          assigneeName: schema.users.name,
          projectName: schema.projects.name,
          projectKind: schema.projects.kind,
        })
        .from(schema.tasks)
        .leftJoin(
          schema.projects,
          eq(schema.tasks.projectId, schema.projects.id),
        )
        .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
        .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
        .where(taskScope(auth))
        .orderBy(asc(schema.tasks.status), desc(schema.tasks.id)),
      db
        .select({ id: schema.clients.id, name: schema.clients.name })
        .from(schema.clients)
        .orderBy(schema.clients.name),
      assignableUsers(auth),
      db
        .select()
        .from(schema.workSessions)
        .where(isNull(schema.workSessions.endedAt)),
      db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          clientId: schema.projects.clientId,
          kind: schema.projects.kind,
        })
        .from(schema.projects)
        .orderBy(asc(schema.projects.name)),
      // Critical and Recurring are for people who manage tasks, not workers.
      auth.role === "worker" ? Promise.resolve([]) : listSeries(auth),
      auth.role === "worker" ? Promise.resolve([]) : listTemplates(),
    ]);
  const levels = await getLevels();
  const isWorker = auth.role === "worker";

  const today = localDay(new Date(), config.timeZone);
  const mine = openSessions.find((s) => s.userId === me?.id);
  const mineTask = mine
    ? tasks.find((t) => t.task.id === mine.taskId)?.task
    : undefined;
  // Workers only ever see their own tasks. Everyone else picks mine / team, and the pick is remembered.
  const saved = (await cookies()).get(TASK_SCOPE_COOKIE)?.value;
  const wanted = scopeParam ?? saved;
  const scope: TaskScope =
    !isWorker && TASK_SCOPES.find((s) => s === wanted)
      ? (wanted as TaskScope)
      : "mine";
  // Pick a team (for someone who leads team leaders) and a person from it. Workers have no such filter.
  const [allTeams, allPeople] = isWorker
    ? [[], []]
    : await Promise.all([
        db.select({ id: schema.teams.id, name: schema.teams.name, leaderId: schema.teams.leaderId }).from(schema.teams).orderBy(schema.teams.name),
        db.select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId }).from(schema.users).orderBy(schema.users.name),
      ]);
  const teamOptions = allTeams.filter((t) => auth.role === "super_admin" || auth.ledTeamIds.includes(t.id));
  const teamIds = new Set(teamOptions.map((t) => t.id));
  const teamSel = teamIds.has(Number(teamParam)) ? Number(teamParam) : null;
  const peopleOptions = allPeople.filter((u) =>
    teamSel !== null ? u.teamId === teamSel : auth.role === "super_admin" || (u.teamId !== null && teamIds.has(u.teamId)),
  );
  const personSel = peopleOptions.some((u) => u.id === Number(personParam)) ? Number(personParam) : null;
  const filterQuery = `${teamSel !== null ? `&team=${teamSel}` : ""}${personSel !== null ? `&person=${personSel}` : ""}`;
  // Tasks waiting for your review always show, whichever list you picked. A picked person or team replaces
  // the My / Team / Unassigned choice.
  const inScope = tasks.filter(({ task }) =>
    personSel !== null
      ? task.assigneeId === personSel
      : teamSel !== null
        ? task.teamId === teamSel
        : scope === "team" || (task.status === "review" && task.reviewerId === me.id)
          ? true
          : scope === "unassigned"
            ? !task.assigneeId
            : !me || task.assigneeId === me.id,
  );
  const now = new Date();
  type Row = (typeof tasks)[number];
  // Critical: open tasks that are overdue or due within the critical hours. A repeat copy that
  // has not reached its start date is not active yet.
  const urgent = ({ task }: Row) => {
    if (!task.dueDate || (task.startDate && task.startDate > today))
      return false;
    const level = urgencyOf(task, levels, config.timeZone, now);
    return level === "critical";
  };
  const tabs = [
    "open",
    "progress",
    "finished",
    "critical",
    "recurring",
    "blocked",
    "deleted",
  ] as const;
  type Tab = (typeof tabs)[number];
  const managerOnly: Tab[] = ["critical", "recurring", "deleted"];
  const asked = tabs.find((t) => t === show);
  const tab: Tab =
    asked && !(isWorker && managerOnly.includes(asked)) ? asked : "open";
  const matches = {
    // A repeat copy waiting for its start date stays out of the open lists until then.
    // Tasks waiting for review are open too: the Review column tells them apart. Started tasks are In progress.
    open: ({ task }: Row) =>
      !task.deletedAt &&
      task.status !== "done" &&
      task.status !== "in_progress" &&
      !(task.startDate && task.startDate > today),
    progress: ({ task }: Row) =>
      !task.deletedAt && task.status === "in_progress" && !(task.startDate && task.startDate > today),
    blocked: ({ task }: Row) => !task.deletedAt && task.status !== "done" && !!task.blockedAt,
    critical: (row: Row) =>
      !row.task.deletedAt &&
      row.task.status !== "done" &&
      row.task.status !== "review" &&
      urgent(row),
    finished: ({ task }: Row) => !task.deletedAt && task.status === "done",
    deleted: ({ task }: Row) => task.deletedAt !== null,
  };
  const counts: Record<Tab, number> = {
    open: inScope.filter(matches.open).length,
    progress: inScope.filter(matches.progress).length,
    blocked: inScope.filter(matches.blocked).length,
    critical: inScope.filter(matches.critical).length,
    recurring: series.filter((s) => s.repeat).length,
    finished: inScope.filter(matches.finished).length,
    deleted: inScope.filter(matches.deleted).length,
  };
  const taskTabs = (
    [
      ["open", "Open"],
      ["progress", "In progress"],
      ["finished", "Finished"],
      ["critical", "Critical"],
      ["recurring", "Recurring"],
      ["blocked", "Blocked"],
      ["deleted", "Deleted"],
    ] as const
  ).filter(([key]) => !isWorker || !managerOnly.includes(key));
  // Recurring: tasks that still repeat are what people work with, so they are the default.
  const seriesState: SeriesState = SERIES_STATES.find((s) => s === stateParam) ?? "active";
  const shownSeries = series.filter((s) =>
    seriesState === "all" ? true : seriesState === "stopped" ? !s.repeat : !!s.repeat,
  );
  // The Review column is in every task list, so approved tasks look the same wherever they show.
  const showReview = true;
  const hoursLeft = (r: Row) =>
    hoursUntilDue(r.task.dueDate!, config.timeZone, now);
  const visible =
    tab === "recurring"
      ? []
      : inScope
          .filter(matches[tab])
          .sort((a, b) =>
            tab === "critical" ? hoursLeft(a) - hoursLeft(b) : 0,
          );

  const upcoming = await upcomingCopies(
    [
      ...new Set(
        visible
          .map((v) => v.task.seriesId)
          .filter((id): id is number => id !== null),
      ),
    ],
    today,
  );
  const checklists = new Map<
    number,
    { id: number; text: string; done: boolean }[]
  >();
  if (visible.length) {
    const rows = await db
      .select()
      .from(schema.taskChecklistItems)
      .where(
        inArray(
          schema.taskChecklistItems.taskId,
          visible.map((v) => v.task.id),
        ),
      )
      .orderBy(
        asc(schema.taskChecklistItems.position),
        asc(schema.taskChecklistItems.id),
      );
    for (const r of rows) {
      const list = checklists.get(r.taskId) ?? [];
      list.push({ id: r.id, text: r.text, done: r.doneAt !== null });
      checklists.set(r.taskId, list);
    }
  }

  // How long each visible task has been blocked in all: every block, and the one still going until now.
  const blockedTotals = new Map<number, { ms: number; times: number }>();
  if (visible.length) {
    const blocks = await db
      .select()
      .from(schema.taskBlocks)
      .where(inArray(schema.taskBlocks.taskId, visible.map((v) => v.task.id)));
    for (const b of blocks) {
      const cur = blockedTotals.get(b.taskId) ?? { ms: 0, times: 0 };
      cur.ms += Math.max(0, (b.unblockedAt ?? now).getTime() - b.blockedAt.getTime());
      cur.times += 1;
      blockedTotals.set(b.taskId, cur);
    }
  }

  return (
    <div className="space-y-4">
      {mine && mineTask && (
        <div className="card flex flex-wrap items-center gap-3 border-emerald-500/50 p-3 text-sm">
          <span>
            You are working on{" "}
            <Link
              href={`/tasks/${mineTask.id}`}
              className="font-medium underline"
            >
              {mineTask.title}
            </Link>{" "}
            since {fmtDateTime(mine.startedAt, config.timeZone)}.
          </span>
          {isSessionStale(mine.startedAt) && (
            <span className="text-amber-700 dark:text-amber-400">
              Open for a long time. Forgot to Stop?
            </span>
          )}
        </div>
      )}

      <TabCard
        tabs={taskTabs.map(([key, label]) => ({
          label,
          href: `/tasks${key === "open" ? "" : `?show=${key}`}${
            filterQuery ? (key === "open" ? `?${filterQuery.slice(1)}` : filterQuery) : ""
          }`,
          count: counts[key],
          alarm: key === "critical" && counts.critical > 0,
          end: key === "critical" || key === "recurring" || key === "blocked" || key === "deleted",
        }))}
        active={Math.max(
          0,
          taskTabs.findIndex(([key]) => key === tab),
        )}
        actions={
          !isWorker ? (
            <NewTaskForm
              clients={clients}
              users={users}
              projects={projects}
              templates={templates}
            />
          ) : undefined
        }
      >
        {tab === "recurring" ? (
          <SeriesTable
            series={shownSeries}
            state={seriesState}
            edit={{
              clients,
              users,
              projects,
              taskOf: (id) => {
                const t = tasks.find((r) => r.task.id === id)?.task;
                return t
                  ? {
                      id: t.id,
                      title: t.title,
                      clientId: t.clientId,
                      projectId: t.projectId,
                      assigneeId: t.assigneeId,
                      dueDate: t.dueDate,
                      repeat: t.repeat,
                      repeatLeadDays: t.repeatLeadDays,
                      repeatShow: t.repeatShow,
                    }
                  : null;
              },
            }}
          />
        ) : (
          <DataGrid
            flush
            alwaysSearch
            toolbar={
              !isWorker ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <TaskPeopleFilter
                    teams={teamOptions.length > 1 ? teamOptions.map((t) => ({ id: t.id, label: t.name })) : []}
                    people={peopleOptions.map((u) => ({ id: u.id, name: u.name }))}
                    team={teamSel}
                    person={personSel}
                  />
                  <TaskScopeToggle
                    scope={scope}
                    teamLabel={
                      auth.role === "super_admin"
                        ? "Everyone's tasks"
                        : "Team tasks"
                    }
                  />
                </div>
              ) : undefined
            }
            empty="No tasks here."
            headers={[
              "Task",
              ...(showReview ? ["Review"] : []),
              { label: "Repeat", title: "W weekly · M monthly · O one-time" },
              ...(isWorker ? [] : ["Assignee"]),
              "Client",
              "Project",
              "Created",
              "Due",
              ...(tab === "finished" ? ["Finished"] : []),
            ]}
            rows={visible.map(
              ({
                task,
                clientName,
                assigneeName,
                projectName,
                projectKind,
              }) => {
                const others = openSessions.filter(
                  (s) => s.taskId === task.id && s.userId !== me?.id,
                );
                const urgency = task.deletedAt
                  ? null
                  : urgencyOf(task, levels, config.timeZone);
                const manage = canManageTask(auth, task);
                const label = taskName(task, clientName);
                const nextPeriod =
                  manage && task.repeat && !task.deletedAt
                    ? nextHidden(
                        upcoming.get(task.seriesId ?? -1),
                        task.dueDate,
                      )
                    : null;
                const isBlocked =
                  !!task.blockedAt && task.status !== "done" && !task.deletedAt;
                // Only the latest review, and only when it sent the task back.
                const isReturned =
                  (task.status === "todo" || task.status === "in_progress") &&
                  task.reviewResult === "rejected" &&
                  !task.deletedAt;
                const hasDetails =
                  isBlocked ||
                  isReturned ||
                  !!task.description ||
                  (checklists.get(task.id)?.length ?? 0) > 0 ||
                  !!nextPeriod;
                const approved = task.status === "done" && task.reviewResult === "approved";
                const search = [
                  task.deletedAt
                    ? "deleted"
                    : task.status === "done"
                      ? "finished done"
                      : task.status === "review"
                        ? "on review review"
                        : task.status === "in_progress"
                          ? "in progress started"
                          : "open",
                  isBlocked ? `blocked ${task.blockedReason ?? ""}` : "",
                  approved ? "approved" : "",
                  isReturned ? `returned ${task.reviewNote ?? ""}` : "",
                  task.repeat === "weekly"
                    ? "weekly recurring repeating"
                    : task.repeat === "monthly"
                      ? "monthly recurring repeating"
                      : "one-time once",
                  assigneeName ?? "unassigned",
                  clientName ?? "",
                  projectName ? `${projectName} ${KIND_LABEL[projectKind ?? "one_off"]}` : "",
                  urgency === "critical" ? "critical overdue" : urgency === "approaching" ? "approaching soon" : "",
                  task.dueDate ?? "",
                  task.doneAt ? fmtDateTime(task.doneAt, config.timeZone) : "",
                ].join(" ");
                return {
                  key: task.id,
                  search,
                  tone: isBlocked
                    ? ("blocked" as const)
                    : urgency === "critical"
                      ? ("critical" as const)
                      : urgency === "approaching"
                        ? ("approaching" as const)
                        : undefined,
                  sort: [
                    task.title,
                    ...(showReview ? [task.reviewResult ?? ""] : []),
                    task.repeat ?? "",
                    ...(isWorker ? [] : [assigneeName ?? ""]),
                    clientName ?? "",
                    projectName ?? "",
                    task.createdAt.toISOString(),
                    task.dueDate ?? "9999-12-31",
                    ...(tab === "finished" ? [task.doneAt?.toISOString() ?? ""] : []),
                  ],
                  cells: [
                    <div key="title">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="font-medium hover:underline"
                        title={task.title}
                      >
                        {task.repeat && task.dueDate
                          ? periodLabel(task.repeat, task.dueDate)
                          : truncate(task.title, TITLE_MAX)}
                      </Link>
                      {task.startDate &&
                        task.startDate > today &&
                        task.status !== "done" && (
                          <span
                            className="badge ml-2 text-muted"
                            title="Shows in your open tasks from this day"
                          >
                            Starts {fmtDay(task.startDate)}
                          </span>
                        )}
                      {others.length > 0 && (
                        <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                          ● {others.length} working now
                        </span>
                      )}
                      {task.repeat && task.dueDate && (
                        <p className="text-xs text-muted">
                          {truncate(task.title, TITLE_MAX)}
                        </p>
                      )}
                    </div>,
                    ...(showReview
                      ? [
                          isBlocked ||
                          task.status === "review" ||
                          (task.status === "done" && task.reviewResult === "approved") ||
                          isReturned ? (
                            <div key="review" className="flex items-center gap-1.5">
                              {isBlocked && <BlockedBadge reason={task.blockedReason} />}
                              {task.status === "done" && task.reviewResult === "approved" && (
                                <ApprovedBadge
                                  at={task.reviewedAt ? fmtDateTime(task.reviewedAt, config.timeZone) : undefined}
                                />
                              )}
                              {task.status === "review" && <OnReviewBadge />}
                              {isReturned && <ReturnedBadge reason={task.reviewNote} />}
                            </div>
                          ) : (
                            <span key="review" className="text-muted">
                              —
                            </span>
                          ),
                        ]
                      : []),
                    <TypeChip key="type" repeat={task.repeat} />,
                    ...(isWorker
                      ? []
                      : [
                          assigneeName ? (
                            <span
                              key="assignee"
                              className="inline-flex"
                              title={assigneeName}
                            >
                              <Avatar name={assigneeName} userId={task.assigneeId} size="sm" />
                              <span className="sr-only">{assigneeName}</span>
                            </span>
                          ) : (
                            <span
                              key="assignee"
                              className="text-muted"
                              title="Unassigned"
                            >
                              —
                            </span>
                          ),
                        ]),
                    task.clientId ? (
                      <Link
                        key="client"
                        href={`/clients/${task.clientId}`}
                        className="text-muted hover:underline"
                      >
                        {clientName}
                      </Link>
                    ) : (
                      <span key="client" className="text-muted">
                        —
                      </span>
                    ),
                    projectName ? (
                      <div key="project">
                        <span>{projectName}</span>
                        <p className="text-xs text-muted">
                          {KIND_LABEL[projectKind ?? "one_off"]}
                        </p>
                      </div>
                    ) : (
                      <span key="project" className="text-muted">
                        —
                      </span>
                    ),
                    <span
                      key="created"
                      className="whitespace-nowrap text-muted"
                    >
                      {fmtDay(localDay(task.createdAt, config.timeZone))}
                    </span>,
                    task.dueDate ? (
                      <span
                        key="due"
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <span
                          className={
                            urgency === "critical"
                              ? "font-medium text-red-600 dark:text-red-400"
                              : urgency === "approaching"
                                ? "font-medium text-amber-700 dark:text-amber-400"
                                : undefined
                          }
                          title={
                            urgency === "critical" || urgency === "approaching"
                              ? timeLeftLabel(task.dueDate, config.timeZone)
                              : undefined
                          }
                        >
                          {fmtDay(task.dueDate)}
                        </span>
                      </span>
                    ) : (
                      <span key="due" className="text-muted">
                        —
                      </span>
                    ),
                    ...(tab === "finished"
                      ? [
                          <span key="finished" className="whitespace-nowrap text-muted">
                            {task.doneAt ? fmtDateTime(task.doneAt, config.timeZone) : "—"}
                          </span>,
                        ]
                      : []),
                  ],
                  actions: task.deletedAt ? (
                    manage ? (
                      <>
                        <RestoreTaskButton compact taskId={task.id} title={label} />
                        <PurgeTaskButton
                          compact
                          taskId={task.id}
                          title={label}
                        />
                      </>
                    ) : null
                  ) : (
                    <>
                      {task.status === "done" && (
                        <ReopenTaskButton compact taskId={task.id} title={label} />
                      )}
                      {task.status !== "review" && task.status !== "done" && (
                      <TimerControls
                        compact
                        taskId={task.id}
                        title={label}
                        lockedTo={
                          task.assigneeId && task.assigneeId !== me.id
                            ? (assigneeName ?? "someone else")
                            : null
                        }
                        done={false}
                        runningSince={
                          mine?.taskId === task.id
                            ? mine.startedAt.toISOString()
                            : null
                        }
                        otherTask={
                          mine && mineTask && mine.taskId !== task.id
                            ? { id: mineTask.id, title: mineTask.title }
                            : null
                        }
                      />
                      )}
                      {canReviewTask(auth, task) && (
                        <ReviewActions taskId={task.id} title={label} />
                      )}
                      {
                        <TaskMenu
                          canManage={manage}
                          task={{
                            id: task.id,
                            title: task.title,
                            label,
                            clientId: task.clientId,
                            projectId: task.projectId,
                            assigneeId: task.assigneeId,
                            dueDate: task.dueDate,
                            repeat: task.repeat,
                            repeatLeadDays: task.repeatLeadDays,
                            repeatShow: task.repeatShow,
                            seriesId: task.seriesId,
                            blocked: !!task.blockedAt && task.status !== "done",
                          }}
                          clients={clients}
                          users={users}
                          projects={projects}
                        />
                      }
                    </>
                  ),
                  // Nothing to show means no arrow: only tasks with history, instructions, a checklist or a next period open.
                  details: hasDetails ? (
                    <div className="space-y-4 text-sm">
                      {isBlocked && (
                        <div className="card space-y-2 border-red-500/50 p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 font-medium text-red-600 dark:text-red-400">
                              <i aria-hidden className="pi pi-ban text-sm" />
                              Blocked
                            </p>
                            {task.blockedAt && (
                              <span
                                className="badge text-red-600 dark:text-red-400"
                                title="How long it has been blocked"
                              >
                                <i aria-hidden className="pi pi-clock mr-1 text-xs" />
                                {spanSince(task.blockedAt)}
                              </span>
                            )}
                          </div>
                          {task.blockedReason ? (
                            <p className="whitespace-pre-wrap">{task.blockedReason}</p>
                          ) : (
                            <p className="text-muted">No reason given.</p>
                          )}
                          {task.blockedAt && (
                            <p className="text-xs text-muted">
                              Blocked on {fmtDateTime(task.blockedAt, config.timeZone)}
                              {(blockedTotals.get(task.id)?.times ?? 0) > 1 &&
                                ` · ${fmtSpan(blockedTotals.get(task.id)!.ms)} blocked in total, over ${blockedTotals.get(task.id)!.times} times`}
                            </p>
                          )}
                        </div>
                      )}

                      {isReturned && (
                        <div className="card space-y-1 border-red-500/50 p-3 text-sm">
                          <p className="font-medium text-red-600 dark:text-red-400">
                            Returned
                            {task.reviewedAt && (
                              <span className="ml-2 text-xs font-normal">
                                {fmtDateTime(task.reviewedAt, config.timeZone)}
                              </span>
                            )}
                          </p>
                          <p className="whitespace-pre-wrap">
                            {task.reviewNote ?? "No reason given."}
                          </p>
                          <p className="text-xs text-muted">
                            Fix it and press Finish again to send it for review.
                          </p>
                        </div>
                      )}

                      {(task.description ||
                        (checklists.get(task.id)?.length ?? 0) > 0) && (
                        <TaskChecklist
                          taskId={task.id}
                          description={task.description}
                          items={checklists.get(task.id) ?? []}
                          canEdit={false}
                          canTick={!task.deletedAt && task.status !== "done"}
                        />
                      )}

                      {(() => {
                        const next =
                          manage && task.repeat && !task.deletedAt
                            ? nextHidden(
                                upcoming.get(task.seriesId ?? -1),
                                task.dueDate,
                              )
                            : null;
                        return next && task.repeat ? (
                          <NextPeriodButton
                            nextTaskId={next.id}
                            label={periodLabel(task.repeat, next.dueDate)}
                          />
                        ) : null;
                      })()}
                    </div>
                  ) : undefined,
                };
              },
            )}
          />
        )}
      </TabCard>
    </div>
  );
}

export default function Home({ searchParams }: PageProps<"/tasks">) {
  const filter = searchParams.then((p) => ({
    show: typeof p.show === "string" ? p.show : undefined,
    scope: typeof p.scope === "string" ? p.scope : undefined,
    state: typeof p.state === "string" ? p.state : undefined,
    team: typeof p.team === "string" ? p.team : undefined,
    person: typeof p.person === "string" ? p.person : undefined,
  }));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Tasks</h1>
      <Suspense fallback={<ListSkeleton />}>
        <TaskList filter={filter} />
      </Suspense>
    </div>
  );
}
