import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { TASK_SCOPE_COOKIE, TaskScopeToggle, type TaskScope } from "@/components/task-scope-toggle";
import { Suspense } from "react";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { RestoreTaskButton } from "@/components/restore-task-button";
import { NewTaskForm } from "@/components/new-task-form";
import { TaskMenu } from "@/components/task-menu";
import { TaskRow } from "@/components/task-row";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { assignableUsers, canManageTask, getAuth, taskScope } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtDuration, localDay, truncate } from "@/lib/format";
import { isSessionStale, trackedByTask } from "@/lib/report";
import { listSeries } from "@/lib/series";
import { DEFAULT_LEVELS, URGENCY_CLASS, URGENCY_LABEL, hoursUntilDue, timeLeftLabel, urgencyOf } from "@/lib/urgency";

const TITLE_MAX = 50;
const repeatLabel = { weekly: "Weekly", monthly: "Monthly" } as const;
const statusLabel = { todo: "To do", in_progress: "In progress", done: "Done" } as const;

function SeriesTable({ series }: { series: Awaited<ReturnType<typeof listSeries>> }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Repeats</th>
            <th className="px-3 py-2 text-right font-medium">Done</th>
            <th className="px-3 py-2 text-right font-medium">Total time</th>
            <th className="px-3 py-2 font-medium">Next due</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/recurring/${s.id}`} className="font-medium hover:underline">
                  {s.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">
                {s.clientId ? (
                  <Link href={`/clients/${s.clientId}`} className="hover:underline">
                    {s.clientName}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                {s.repeat ? <span className="badge">{repeatLabel[s.repeat]}</span> : <span className="badge text-muted">Stopped</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {s.done} / {s.occurrences}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {s.trackedSeconds ? fmtDuration(s.trackedSeconds) : "—"}
              </td>
              <td className="px-3 py-2 text-muted">{s.nextDue ? fmtDay(s.nextDue) : "—"}</td>
            </tr>
          ))}
          {series.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted">
                No recurring tasks yet. Add a task and answer Yes to &quot;Is this task recurring?&quot;
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

async function TaskList({ filter }: { filter: Promise<{ show?: string; scope?: string }> }) {
  const [auth, { show, scope: scopeParam }] = await Promise.all([getAuth(), filter]);
  if (!auth) redirect("/login");
  const me = auth.user;
  const [tasks, clients, users, tracked, openSessions, teams, projects, series] = await Promise.all([
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
    trackedByTask(),
    db.select().from(schema.workSessions).where(isNull(schema.workSessions.endedAt)),
    db.select().from(schema.teams),
    db
      .select({ id: schema.projects.id, name: schema.projects.name, clientId: schema.projects.clientId, kind: schema.projects.kind })
      .from(schema.projects)
      .orderBy(asc(schema.projects.name)),
    // Critical and Recurring are for people who manage tasks, not workers.
    auth.role === "worker" ? Promise.resolve([]) : listSeries(auth),
  ]);
  const teamLevels = new Map(teams.map((t) => [t.id, { approachingHours: t.approachingHours, criticalHours: t.criticalHours }]));
  const isWorker = auth.role === "worker";

  const today = localDay(new Date(), config.timeZone);
  const mine = openSessions.find((s) => s.userId === me?.id);
  const mineTask = mine ? tasks.find((t) => t.task.id === mine.taskId)?.task : undefined;
  // Workers only ever see their own tasks. Everyone else picks mine / team, and the pick is remembered.
  const saved = (await cookies()).get(TASK_SCOPE_COOKIE)?.value;
  const wanted = scopeParam ?? saved;
  const scope: TaskScope = isWorker || wanted !== "team" ? "mine" : "team";
  const inScope = tasks.filter(
    ({ task }) => scope === "team" || !me || task.assigneeId === me.id || !task.assigneeId,
  );
  const now = new Date();
  type Row = (typeof tasks)[number];
  // Critical: open tasks that are overdue or close to due, by their team's levels. A repeat copy that
  // has not reached its start date is not active yet.
  const urgent = ({ task }: Row) => {
    if (!task.dueDate || (task.startDate && task.startDate > today)) return false;
    const level = urgencyOf(task, teamLevels.get(task.teamId ?? -1) ?? DEFAULT_LEVELS, config.timeZone, now);
    return level === "critical" || level === "approaching";
  };
  const tabs = ["open", "critical", "recurring", "finished", "deleted"] as const;
  type Tab = (typeof tabs)[number];
  const managerOnly: Tab[] = ["critical", "recurring", "deleted"];
  const asked = tabs.find((t) => t === show);
  const tab: Tab = asked && !(isWorker && managerOnly.includes(asked)) ? asked : "open";
  const matches = {
    open: ({ task }: Row) => !task.deletedAt && task.status !== "done",
    critical: (row: Row) => !row.task.deletedAt && row.task.status !== "done" && urgent(row),
    finished: ({ task }: Row) => !task.deletedAt && task.status === "done",
    deleted: ({ task }: Row) => task.deletedAt !== null,
  };
  const counts: Record<Tab, number> = {
    open: inScope.filter(matches.open).length,
    critical: inScope.filter(matches.critical).length,
    recurring: series.length,
    finished: inScope.filter(matches.finished).length,
    deleted: inScope.filter(matches.deleted).length,
  };
  const hoursLeft = (r: Row) => hoursUntilDue(r.task.dueDate!, config.timeZone, now);
  const visible =
    tab === "recurring" ? [] : inScope.filter(matches[tab]).sort((a, b) => (tab === "critical" ? hoursLeft(a) - hoursLeft(b) : 0));
  const ownTeam = auth.role === "leader" ? auth.ledTeam : null;
  const levels = ownTeam ?? DEFAULT_LEVELS;

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

      {!isWorker && <NewTaskForm clients={clients} users={users} projects={projects} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 text-sm">
          {(
            [
              ["open", "Open Tasks"],
              ["critical", "Critical"],
              ["recurring", "Recurring"],
              ["finished", "Finished"],
              ["deleted", "Deleted"],
            ] as const
          )
            .filter(([key]) => !isWorker || !managerOnly.includes(key))
            .map(([key, label]) => (
              <Link
                key={key}
                href={key === "open" ? "/tasks" : `/tasks?show=${key}`}
                aria-current={tab === key ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition-colors ${
                  tab === key
                    ? "border-transparent bg-primary font-medium text-(--primary-fg)"
                    : "border-border text-muted hover:border-primary/50 hover:bg-primary/10 hover:text-foreground"
                }`}
              >
                {label}
                <span
                  className={`rounded-full px-1.5 font-mono text-xs tabular-nums ${
                    tab === key ? "bg-white/20" : "bg-black/5 dark:bg-white/10"
                  }`}
                >
                  {counts[key]}
                </span>
              </Link>
            ))}
        </div>
        {!isWorker && tab !== "recurring" && (
          <TaskScopeToggle scope={scope} teamLabel={auth.role === "super_admin" ? "Everyone's tasks" : "Team tasks"} />
        )}
      </div>

      {tab === "critical" && (
        <p className="max-w-2xl text-sm text-muted">
          {ownTeam ? `${ownTeam.name}: ` : ""}
          Critical means overdue or due in under {levels.criticalHours}h. Approaching means under {levels.approachingHours}h.{" "}
          {ownTeam ? "Change these on your team's page." : "Each team sets its own levels on its team page."}
        </p>
      )}
      {tab === "recurring" && (
        <p className="text-sm text-muted">Each row is one repeating task. Open it to see every time it was done.</p>
      )}

      {tab === "recurring" ? (
        <SeriesTable series={series} />
      ) : (
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="w-8" />
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ task, clientName, assigneeName, projectName, projectKind }) => {
              const others = openSessions.filter((s) => s.taskId === task.id && s.userId !== me?.id);
              const trackedSeconds = tracked.get(task.id);
              const urgency = urgencyOf(task, teamLevels.get(task.teamId ?? -1) ?? DEFAULT_LEVELS, config.timeZone);
              const manage = canManageTask(auth, task);
              return (
                <TaskRow
                  key={task.id}
                  cells={[
                    <div key="title">
                      <Link href={`/tasks/${task.id}`} className="font-medium hover:underline" title={task.title}>
                        {truncate(task.title, TITLE_MAX)}
                      </Link>
                      {task.deletedAt && <span className="badge ml-2 text-red-600">Deleted</span>}
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
                    </div>,
                    <span key="type" className="badge">{task.repeat ? repeatLabel[task.repeat] : "One-time"}</span>,
                    assigneeName ? (
                      <span key="assignee" className="inline-flex items-center gap-2 whitespace-nowrap">
                        <Avatar name={assigneeName} size="sm" />
                        {assigneeName}
                      </span>
                    ) : (
                      <span key="assignee" className="text-muted">Unassigned</span>
                    ),
                    task.clientId ? (
                      <Link key="client" href={`/clients/${task.clientId}`} className="text-muted hover:underline">
                        {clientName}
                      </Link>
                    ) : (
                      <span key="client" className="text-muted">—</span>
                    ),
                    projectName ? (
                      <span key="project" className="inline-flex items-center gap-2">
                        {projectName}
                        {projectKind === "ongoing" && <span className="badge text-muted">Ongoing</span>}
                      </span>
                    ) : (
                      <span key="project" className="text-muted">—</span>
                    ),
                    task.dueDate ? (
                      <span key="due" className="flex items-center gap-2 whitespace-nowrap">
                        {fmtDay(task.dueDate)}
                        {urgency && urgency !== "on_track" && (
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
                    <span key="status" className="badge">{statusLabel[task.status]}</span>,
                  ]}
                  actions={
                    task.deletedAt ? (
                      manage ? <RestoreTaskButton compact taskId={task.id} /> : null
                    ) : (
                      <>
                        <TimerControls
                          compact
                          taskId={task.id}
                          title={task.title}
                          lockedTo={task.assigneeId && task.assigneeId !== me.id ? (assigneeName ?? "someone else") : null}
                          done={task.status === "done"}
                          runningSince={mine?.taskId === task.id ? mine.startedAt.toISOString() : null}
                          otherTask={
                            mine && mineTask && mine.taskId !== task.id ? { id: mineTask.id, title: mineTask.title } : null
                          }
                        />
                        {manage && (
                          <TaskMenu
                            task={{
                              id: task.id,
                              title: task.title,
                              clientId: task.clientId,
                              projectName: projectName,
                              assigneeId: task.assigneeId,
                              dueDate: task.dueDate,
                              repeat: task.repeat,
                              repeatLeadDays: task.repeatLeadDays,
                            }}
                            clients={clients}
                            users={users}
                            projects={projects}
                          />)}
                      </>
                    )
                  }
                  details={
                    <div className="flex flex-wrap items-start gap-x-8 gap-y-2 text-sm">
                      <div className="min-w-full">
                        <p className="text-xs text-muted">Task</p>
                        <p>{task.title}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Assignee</p>
                        <p>{assigneeName ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Tracked in Hubstaff</p>
                        <p className="font-mono tabular-nums">{trackedSeconds ? fmtDuration(trackedSeconds) : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted">Hubstaff</p>
                        <p>{task.hubstaffTaskId ? `Task #${task.hubstaffTaskId}` : "Not created yet"}</p>
                      </div>
                      <Link href={`/tasks/${task.id}`} className="self-end underline">
                        Full details &amp; sessions →
                      </Link>
                    </div>
                  }
                />
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted">
                  No tasks here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
