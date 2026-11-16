import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { TaskScopeToggle } from "@/components/task-scope-toggle";
import { TASK_SCOPE_COOKIE, TASK_SCOPES, type TaskScope } from "@/lib/task-scope";
import { Fragment, Suspense } from "react";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { RestoreTaskButton } from "@/components/restore-task-button";
import { NewTaskForm } from "@/components/new-task-form";
import { SeriesMenu } from "@/components/series-menu";
import { TaskMenu } from "@/components/task-menu";
import { DataGrid } from "@/components/data-grid";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { assignableUsers, canManageTask, getAuth, taskScope } from "@/lib/auth";
import { canReviewTask, reviewsByTask } from "@/lib/review";
import { ReviewHistory } from "@/components/review-history";
import { ReviewActions } from "@/components/review-actions";
import { NextPeriodButton } from "@/components/next-period-button";
import { fmtDateTime, fmtDay, fmtDuration, localDay, truncate } from "@/lib/format";
import { isSessionStale } from "@/lib/report";
import { KIND_LABEL } from "@/lib/project-kind";
import { listSeries } from "@/lib/series";
import { listTemplates } from "@/lib/templates";
import { nextHidden, periodLabel, upcomingCopies } from "@/lib/recurring";
import { Avatar } from "@/components/avatar";
import { InlineChecklist } from "@/components/inline-checklist";
import { DEFAULT_LEVELS, URGENCY_CLASS, URGENCY_LABEL, hoursUntilDue, timeLeftLabel, urgencyOf } from "@/lib/urgency";

const TITLE_MAX = 50;
const repeatLabel = { weekly: "Weekly", monthly: "Monthly" } as const;

/** W weekly, M monthly, O one-time: a small coloured letter, with the full word on hover. */
function TypeChip({ repeat }: { repeat: "weekly" | "monthly" | null }) {
  const [letter, word, tone] =
    repeat === "weekly"
      ? ["W", "Weekly", "bg-sky-500/15 text-sky-700 dark:text-sky-300"]
      : repeat === "monthly"
        ? ["M", "Monthly", "bg-violet-500/15 text-violet-700 dark:text-violet-300"]
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
  taskOf: (id: number) => React.ComponentProps<typeof SeriesMenu>["task"] | null;
};

function SeriesTable({ series, edit }: { series: Awaited<ReturnType<typeof listSeries>>; edit: SeriesEdit }) {
  const today = localDay(new Date(), config.timeZone);
  return (
    <DataGrid
      empty={<>No recurring tasks yet. Add a task and answer Yes to &quot;Is this task recurring?&quot;</>}
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
            <span key="t" className="font-medium">
              {s.title}
            </span>,
            s.clientId ? (
              <Link key="c" href={`/clients/${s.clientId}`} className="text-muted hover:underline">
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
            <SeriesMenu task={task} clients={edit.clients} users={edit.users} projects={edit.projects} />
          ) : null,
          details: (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p className="text-muted">
                  {s.occurrences} {s.occurrences === 1 ? "copy" : "copies"} · {s.done} finished · newest first
                </p>
                <Link href={`/recurring/${s.id}`} className="text-sm underline">
                  Open full history →
                </Link>
              </div>
              <DataGrid
                plain
                headers={["Period", "Due", "Status", "Assignee", "Finished", { label: "Time", align: "right" }]}
                rows={history.map((o) => ({
                  key: o.id,
                  cells: [
                    <div key="p">
                      <Link href={`/tasks/${o.id}`} className="font-medium hover:underline">
                        {s.repeat && o.dueDate ? periodLabel(s.repeat, o.dueDate) : o.title}
                      </Link>
                      {o.startDate && o.startDate > today && o.status !== "done" && (
                        <span className="badge ml-2 text-muted">Starts {fmtDay(o.startDate)}</span>
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
                      {o.status === "done" ? "Done" : o.status === "review" ? "On review" : "Open"}
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

async function TaskList({ filter }: { filter: Promise<{ show?: string; scope?: string }> }) {
  const [auth, { show, scope: scopeParam }] = await Promise.all([getAuth(), filter]);
  if (!auth) redirect("/login");
  const me = auth.user;
  const [tasks, clients, users, openSessions, teams, projects, series, templates] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        clientName: schema.clients.name,
        assigneeName: schema.users.name,
        projectName: schema.projects.name,
        projectKind: schema.projects.kind,
      })
      .from(schema.tasks)
      .leftJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
      .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
      .where(taskScope(auth))
      .orderBy(asc(schema.tasks.status), desc(schema.tasks.id)),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(schema.clients.name),
    assignableUsers(auth),
    db.select().from(schema.workSessions).where(isNull(schema.workSessions.endedAt)),
    db.select().from(schema.teams),
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
  const teamLevels = new Map(
    teams.map((t) => [t.id, { approachingHours: t.approachingHours, criticalHours: t.criticalHours }]),
  );
  const isWorker = auth.role === "worker";

  const today = localDay(new Date(), config.timeZone);
  const mine = openSessions.find((s) => s.userId === me?.id);
  const mineTask = mine ? tasks.find((t) => t.task.id === mine.taskId)?.task : undefined;
  // Workers only ever see their own tasks. Everyone else picks mine / team, and the pick is remembered.
  const saved = (await cookies()).get(TASK_SCOPE_COOKIE)?.value;
  const wanted = scopeParam ?? saved;
  const scope: TaskScope = !isWorker && TASK_SCOPES.find((s) => s === wanted) ? (wanted as TaskScope) : "mine";
  // Tasks waiting for your review always show, whichever list you picked.
  const inScope = tasks.filter(({ task }) =>
    scope === "team" || (task.status === "review" && task.reviewerId === me.id)
      ? true
      : scope === "unassigned"
        ? !task.assigneeId
        : !me || task.assigneeId === me.id,
  );
  const now = new Date();
  type Row = (typeof tasks)[number];
  // Critical: open tasks that are overdue or due within their team's critical hours. A repeat copy that
  // has not reached its start date is not active yet.
  const urgent = ({ task }: Row) => {
    if (!task.dueDate || (task.startDate && task.startDate > today)) return false;
    const level = urgencyOf(task, teamLevels.get(task.teamId ?? -1) ?? DEFAULT_LEVELS, config.timeZone, now);
    return level === "critical";
  };
  const tabs = ["open", "review", "critical", "recurring", "finished", "deleted"] as const;
  type Tab = (typeof tabs)[number];
  const managerOnly: Tab[] = ["critical", "recurring", "deleted"];
  const asked = tabs.find((t) => t === show);
  const tab: Tab = asked && !(isWorker && managerOnly.includes(asked)) ? asked : "open";
  const matches = {
    // A repeat copy waiting for its start date stays out of the open lists until then.
    open: ({ task }: Row) =>
      !task.deletedAt &&
      task.status !== "done" &&
      task.status !== "review" &&
      !(task.startDate && task.startDate > today),
    review: ({ task }: Row) => !task.deletedAt && task.status === "review",
    critical: (row: Row) =>
      !row.task.deletedAt && row.task.status !== "done" && row.task.status !== "review" && urgent(row),
    finished: ({ task }: Row) => !task.deletedAt && task.status === "done",
    deleted: ({ task }: Row) => task.deletedAt !== null,
  };
  const counts: Record<Tab, number> = {
    open: inScope.filter(matches.open).length,
    review: inScope.filter(matches.review).length,
    critical: inScope.filter(matches.critical).length,
    recurring: series.length,
    finished: inScope.filter(matches.finished).length,
    deleted: inScope.filter(matches.deleted).length,
  };
  const hoursLeft = (r: Row) => hoursUntilDue(r.task.dueDate!, config.timeZone, now);
  const visible =
    tab === "recurring"
      ? []
      : inScope.filter(matches[tab]).sort((a, b) => (tab === "critical" ? hoursLeft(a) - hoursLeft(b) : 0));

  const upcoming = await upcomingCopies(
    [...new Set(visible.map((v) => v.task.seriesId).filter((id): id is number => id !== null))],
    today,
  );
  const reviews = await reviewsByTask(visible.map((v) => v.task.id));
  const checklists = new Map<number, { id: number; text: string; done: boolean }[]>();
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
      .orderBy(asc(schema.taskChecklistItems.position), asc(schema.taskChecklistItems.id));
    for (const r of rows) {
      const list = checklists.get(r.taskId) ?? [];
      list.push({ id: r.id, text: r.text, done: r.doneAt !== null });
      checklists.set(r.taskId, list);
    }
  }

  return (
    <div className="space-y-4">
      {mine && mineTask && (
        <div className="card flex flex-wrap items-center gap-3 border-emerald-500/50 p-3 text-sm">
          <span>
            You are working on{" "}
            <Link href={`/tasks/${mineTask.id}`} className="font-medium underline">
              {mineTask.title}
            </Link>{" "}
            since {fmtDateTime(mine.startedAt, config.timeZone)}.
          </span>
          {isSessionStale(mine.startedAt) && (
            <span className="text-amber-700 dark:text-amber-400">Open for a long time. Forgot to Stop?</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <nav aria-label="Task lists" className="flex flex-wrap items-center gap-1 text-sm">
          {(
            [
              ["open", "Open"],
              ["review", "On review"],
              ["critical", "Critical"],
              ["recurring", "Recurring"],
              ["finished", "Finished"],
              ["deleted", "Deleted"],
            ] as const
          )
            .filter(([key]) => !isWorker || !managerOnly.includes(key))
            .map(([key, label]) => {
              const active = tab === key;
              const alarm = key === "critical" && counts.critical > 0;
              return (
                <Link
                  key={key}
                  href={key === "open" ? "/tasks" : `/tasks?show=${key}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 transition-colors ${
                    active
                      ? "bg-primary/10 font-semibold text-foreground"
                      : "text-muted hover:bg-primary/5 hover:text-foreground"
                  }`}
                >
                  {label}
                  <span
                    className={`font-mono text-xs tabular-nums ${alarm ? "font-semibold text-red-600 dark:text-red-400" : "opacity-70"}`}
                  >
                    {counts[key]}
                  </span>
                </Link>
              );
            })}
        </nav>
        {!isWorker && (
          <div className="flex flex-wrap items-center gap-2">
            {tab !== "recurring" && (
              <TaskScopeToggle
                scope={scope}
                teamLabel={auth.role === "super_admin" ? "Everyone's tasks" : "Team tasks"}
              />
            )}
            <NewTaskForm clients={clients} users={users} projects={projects} templates={templates} />
          </div>
        )}
      </div>

      {tab === "recurring" ? (
        <SeriesTable
          series={series}
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
          empty="No tasks here."
          headers={[
            "Task",
            { label: "Repeat", title: "W weekly · M monthly · O one-time" },
            ...(isWorker ? [] : ["Assignee"]),
            "Client",
            "Project",
            "Project type",
            "Created",
            "Due",
          ]}
          rows={visible.map(({ task, clientName, assigneeName, projectName, projectKind }) => {
            const others = openSessions.filter((s) => s.taskId === task.id && s.userId !== me?.id);
            const urgency = urgencyOf(task, teamLevels.get(task.teamId ?? -1) ?? DEFAULT_LEVELS, config.timeZone);
            const manage = canManageTask(auth, task);
            const nextPeriod =
              manage && task.repeat && !task.deletedAt
                ? nextHidden(upcoming.get(task.seriesId ?? -1), task.dueDate)
                : null;
            const hasDetails =
              (reviews.get(task.id)?.length ?? 0) > 0 ||
              !!task.description ||
              (checklists.get(task.id)?.length ?? 0) > 0 ||
              !!nextPeriod;
            return {
              key: task.id,
              cells: [
                <div key="title">
                  <Link href={`/tasks/${task.id}`} className="font-medium hover:underline" title={task.title}>
                    {truncate(task.title, TITLE_MAX)}
                  </Link>
                  {task.deletedAt && <span className="badge ml-2 text-red-600">Deleted</span>}
                  {task.status === "review" && (
                    <span className="badge ml-2 text-amber-700 dark:text-amber-400">On review</span>
                  )}
                  {task.status === "todo" && task.reviewResult === "rejected" && (
                    <span className="badge ml-2 text-red-600" title={task.reviewNote ?? undefined}>
                      Checked: not OK
                    </span>
                  )}
                  {task.status === "done" && task.reviewResult === "approved" && (
                    <span className="badge ml-2 text-emerald-700 dark:text-emerald-400">Checked: OK</span>
                  )}
                  {task.startDate && task.startDate > today && task.status !== "done" && (
                    <span className="badge ml-2 text-muted" title="Shows in your open tasks from this day">
                      Starts {fmtDay(task.startDate)}
                    </span>
                  )}
                  {others.length > 0 && (
                    <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                      ● {others.length} working now
                    </span>
                  )}
                  {task.repeat && task.dueDate && (
                    <p className="text-xs text-muted">{periodLabel(task.repeat, task.dueDate)}</p>
                  )}
                </div>,
                <TypeChip key="type" repeat={task.repeat} />,
                ...(isWorker
                  ? []
                  : [
                      assigneeName ? (
                        <span key="assignee" className="inline-flex" title={assigneeName}>
                          <Avatar name={assigneeName} size="sm" />
                          <span className="sr-only">{assigneeName}</span>
                        </span>
                      ) : (
                        <span key="assignee" className="text-muted" title="Unassigned">
                          —
                        </span>
                      ),
                    ]),
                task.clientId ? (
                  <Link key="client" href={`/clients/${task.clientId}`} className="text-muted hover:underline">
                    {clientName}
                  </Link>
                ) : (
                  <span key="client" className="text-muted">
                    —
                  </span>
                ),
                projectName ? (
                  <span key="project">{projectName}</span>
                ) : (
                  <span key="project" className="text-muted">
                    —
                  </span>
                ),
                projectName ? (
                  <span key="kind" className="whitespace-nowrap text-muted">
                    {KIND_LABEL[projectKind ?? "one_off"]}
                  </span>
                ) : (
                  <span key="kind" className="text-muted">
                    —
                  </span>
                ),
                <span key="created" className="whitespace-nowrap text-muted">
                  {fmtDay(localDay(task.createdAt, config.timeZone))}
                </span>,
                task.dueDate ? (
                  <span key="due" className="flex items-center gap-2 whitespace-nowrap">
                    <span
                      className={urgency === "critical" ? "font-medium text-red-600 dark:text-red-400" : undefined}
                      title={urgency === "critical" ? timeLeftLabel(task.dueDate, config.timeZone) : undefined}
                    >
                      {fmtDay(task.dueDate)}
                    </span>
                    {urgency && urgency !== "on_track" && urgency !== "critical" && (
                      <span
                        className={`badge ${URGENCY_CLASS[urgency]}`}
                        title={timeLeftLabel(task.dueDate, config.timeZone)}
                      >
                        {URGENCY_LABEL[urgency]}
                      </span>
                    )}
                  </span>
                ) : (
                  <span key="due" className="text-muted">
                    —
                  </span>
                ),
              ],
              actions: task.deletedAt ? (
                manage ? (
                  <RestoreTaskButton compact taskId={task.id} />
                ) : null
              ) : (
                <>
                  <TimerControls
                    compact
                    taskId={task.id}
                    title={task.title}
                    lockedTo={task.assigneeId && task.assigneeId !== me.id ? (assigneeName ?? "someone else") : null}
                    done={task.status === "done" || task.status === "review"}
                    runningSince={mine?.taskId === task.id ? mine.startedAt.toISOString() : null}
                    otherTask={
                      mine && mineTask && mine.taskId !== task.id ? { id: mineTask.id, title: mineTask.title } : null
                    }
                  />
                  {canReviewTask(auth, task) && <ReviewActions taskId={task.id} title={task.title} />}
                  {
                    <TaskMenu
                      canManage={manage}
                      task={{
                        id: task.id,
                        title: task.title,
                        clientId: task.clientId,
                        projectId: task.projectId,
                        assigneeId: task.assigneeId,
                        dueDate: task.dueDate,
                        repeat: task.repeat,
                        repeatLeadDays: task.repeatLeadDays,
                        repeatShow: task.repeatShow,
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
                  {(reviews.get(task.id)?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted">Review history · {reviews.get(task.id)!.length}</p>
                      <ReviewHistory reviews={reviews.get(task.id)!} tz={config.timeZone} />
                    </div>
                  )}

                  {task.description && (
                    <div>
                      <p className="text-xs text-muted">Instructions</p>
                      <p className="whitespace-pre-wrap">{task.description}</p>
                    </div>
                  )}

                  {(checklists.get(task.id)?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted">
                        Checklist · {checklists.get(task.id)!.filter((i) => i.done).length} of{" "}
                        {checklists.get(task.id)!.length} checked
                      </p>
                      <InlineChecklist
                        items={checklists.get(task.id)!}
                        canTick={!task.deletedAt && task.status !== "done"}
                      />
                    </div>
                  )}

                  {(() => {
                    const next =
                      manage && task.repeat && !task.deletedAt
                        ? nextHidden(upcoming.get(task.seriesId ?? -1), task.dueDate)
                        : null;
                    return next && task.repeat ? (
                      <NextPeriodButton nextTaskId={next.id} label={periodLabel(task.repeat, next.dueDate)} />
                    ) : null;
                  })()}
                </div>
              ) : undefined,
            };
          })}
        />
      )}
    </div>
  );
}

export default function Home({ searchParams }: PageProps<"/tasks">) {
  const filter = searchParams.then((p) => ({
    show: typeof p.show === "string" ? p.show : undefined,
    scope: typeof p.scope === "string" ? p.scope : undefined,
  }));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Tasks</h1>
      <Suspense fallback={<p className="text-muted">Loading tasks…</p>}>
        <TaskList filter={filter} />
      </Suspense>
    </div>
  );
}
