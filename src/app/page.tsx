import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { NewTaskForm } from "@/components/new-task-form";
import { TimerControls } from "@/components/timer-controls";
import { config } from "@/lib/config";
import { getCurrentUser } from "@/lib/current-user";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { isSessionStale, trackedByTask, unmatchedTime } from "@/lib/report";

const statusLabel = { todo: "To do", in_progress: "In progress", done: "Done" } as const;

async function TaskList({ filter }: { filter: Promise<string | undefined> }) {
  const [me, show] = await Promise.all([getCurrentUser(), filter]);
  const [tasks, clients, users, tracked, openSessions] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        clientName: schema.clients.name,
        assigneeName: schema.users.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
      .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
      .orderBy(asc(schema.tasks.status), desc(schema.tasks.id)),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(schema.clients.name),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(schema.users.name),
    trackedByTask(),
    db.select().from(schema.workSessions).where(isNull(schema.workSessions.endedAt)),
  ]);

  const mine = openSessions.find((s) => s.userId === me?.id);
  const mineTask = mine ? tasks.find((t) => t.task.id === mine.taskId)?.task : undefined;
  const visible = tasks.filter(({ task }) => {
    if (show === "all") return true;
    if (show === "done") return task.status === "done";
    return task.status !== "done" && (show === "everyone" || !me || task.assigneeId === me.id || !task.assigneeId);
  });

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
            <span className="text-amber-700 dark:text-amber-400">Open for a long time. Forgot to Finish?</span>
          )}
        </div>
      )}

      <NewTaskForm clients={clients} users={users} />

      <div className="flex gap-3 text-sm">
        {[
          ["", "My open tasks"],
          ["everyone", "Everyone's open tasks"],
          ["done", "Done"],
          ["all", "All"],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/?show=${key}` : "/"}
            className={(show ?? "") === key ? "font-semibold underline" : "text-muted"}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Tracked</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ task, clientName, assigneeName }) => {
              const others = openSessions.filter((s) => s.taskId === task.id && s.userId !== me?.id);
              return (
                <tr key={task.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                      {task.title}
                    </Link>
                    {others.length > 0 && (
                      <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                        ● {others.length} working now
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{clientName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{assigneeName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="badge">{statusLabel[task.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {tracked.get(task.id) ? fmtDuration(tracked.get(task.id)!) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <TimerControls
                      compact
                      taskId={task.id}
                      done={task.status === "done"}
                      runningSince={mine?.taskId === task.id ? mine.startedAt.toISOString() : null}
                      otherTask={mine && mineTask && mine.taskId !== task.id ? { id: mineTask.id, title: mineTask.title } : null}
                    />
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  No tasks here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function UnmatchedTime() {
  await connection();
  const groups = await unmatchedTime();
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.tracked, 0);
  return (
    <details className="card border-amber-400/60 p-3 text-sm">
      <summary className="cursor-pointer">
        <span className="font-medium text-amber-700 dark:text-amber-400">{fmtDuration(total)}</span> tracked in
        Hubstaff in the last 7 days did not land on a CRM task.
      </summary>
      <ul className="mt-2 space-y-1 text-muted">
        {groups.map((g, i) => (
          <li key={i}>
            {g.userName}: {fmtDuration(g.tracked)}{" "}
            {g.hubstaffTaskId ? `on Hubstaff task #${g.hubstaffTaskId} (not created by the CRM)` : "with no task selected"}
            , last {fmtDateTime(g.last, config.timeZone)}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  const filter = searchParams.then((p) => (typeof p.show === "string" ? p.show : undefined));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <Suspense>
        <UnmatchedTime />
      </Suspense>
      <Suspense fallback={<p className="text-muted">Loading tasks…</p>}>
        <TaskList filter={filter} />
      </Suspense>
    </div>
  );
}
