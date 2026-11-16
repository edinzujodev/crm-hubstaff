import Link from "next/link";
import { connection } from "next/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAuth, taskScope } from "@/lib/auth";
import { config } from "@/lib/config";
import { openTasks } from "@/lib/dashboard/data";
import { fmtTime, truncate } from "@/lib/format";
import { lastSyncAt } from "@/lib/sync";

const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-primary/10";

/**
 * What is worth seeing on every page: the task you have running, how many tasks are critical,
 * when Hubstaff last synced, and today's date.
 */
export async function TopbarStatus() {
  await connection();
  const auth = await getAuth();
  if (!auth) return null;
  const [running, open, synced, onReview, toReview] = await Promise.all([
    db
      .select({ taskId: schema.tasks.id, title: schema.tasks.title, startedAt: schema.workSessions.startedAt })
      .from(schema.workSessions)
      .innerJoin(schema.tasks, eq(schema.workSessions.taskId, schema.tasks.id))
      .where(and(eq(schema.workSessions.userId, auth.user.id), isNull(schema.workSessions.endedAt)))
      .limit(1),
    // Scoped to what this person may see: their own tasks, their team's, or everyone's.
    openTasks({ userId: null, teamId: null }),
    lastSyncAt(),
    // Tasks on review that this person may see, and how many of them wait for their own answer.
    db
      .select({ n: count() })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.status, "review"), isNull(schema.tasks.deletedAt), taskScope(auth))),
    db
      .select({ n: count() })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.status, "review"),
          isNull(schema.tasks.deletedAt),
          eq(schema.tasks.reviewerId, auth.user.id),
        ),
      ),
  ]);
  const reviewTotal = onReview[0]?.n ?? 0;
  const reviewMine = toReview[0]?.n ?? 0;
  // Overdue counts as critical, so this is the same set as the Critical tab on the Tasks page.
  const critical = open.filter((t) => t.urgency === "critical").length;
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(now);
  const task = running[0];

  return (
    <>
      {task && (
        <Link
          href={`/tasks/${task.taskId}`}
          className={`${pill} border-emerald-500/60 text-emerald-700 dark:text-emerald-400`}
          title={`Running since ${fmtTime(task.startedAt, config.timeZone)}`}
        >
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
          Working on {truncate(task.title, 28)} · since {fmtTime(task.startedAt, config.timeZone)}
        </Link>
      )}
      <Link
        href={auth.role === "worker" ? "/tasks" : "/tasks?show=critical&scope=team"}
        className={`${pill} ${critical ? "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400" : "text-muted"}`}
        title="Open tasks that are overdue or due very soon, assigned or not"
      >
        {critical ? `${critical} critical` : "Nothing critical"}
      </Link>
      <Link
        href={reviewMine ? "/tasks?show=review&scope=team" : "/tasks?show=review"}
        className={`${pill} ${reviewMine ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "text-muted"}`}
        title="Finished tasks waiting for the team leader's check"
      >
        {reviewMine ? `${reviewMine} to review` : reviewTotal ? `${reviewTotal} on review` : "Nothing on review"}
      </Link>
      <span className="px-1 text-xs text-muted" title="Hours from Hubstaff can be about 20 minutes late">
        {synced ? `Synced ${fmtTime(synced, config.timeZone)}` : "Not synced yet"}
      </span>
      <span className="hidden px-1 text-xs font-medium sm:inline">{date}</span>
    </>
  );
}
