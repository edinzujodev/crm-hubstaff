import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";

export type Repeat = "weekly" | "monthly";

function parse(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The due date one period after `from` (`YYYY-MM-DD`). Monthly dates clamp to the month end, anchored on `anchorDay`. */
export function addPeriod(from: string, repeat: Repeat, anchorDay?: number | null): string {
  const { y, m, d } = parse(from);
  if (repeat === "weekly") {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return fmt(ny, nm, Math.min(anchorDay ?? d, daysInMonth(ny, nm)));
}

/** Next due date: the previous one plus a period, moved forward until it is today or later. */
export function nextDueDate(prevDue: string, repeat: Repeat, anchorDay: number | null, today: string): string {
  let next = addPeriod(prevDue, repeat, anchorDay);
  while (next < today) next = addPeriod(next, repeat, anchorDay);
  return next;
}

/**
 * Called when a task is marked done. If it repeats and has no copy yet, creates the next one.
 * The unique `repeated_from_id` makes this safe to call twice (done → reopen → done).
 */
export async function spawnNextRepeat(taskId: number) {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task || !task.repeat || !task.dueDate || task.deletedAt) return null;
  const today = localDay(new Date(), config.timeZone);
  const [next] = await db
    .insert(schema.tasks)
    .values({
      title: task.title,
      description: task.description,
      clientId: task.clientId,
      assigneeId: task.assigneeId,
      dueDate: nextDueDate(task.dueDate, task.repeat, task.repeatDay, today),
      repeat: task.repeat,
      repeatDay: task.repeatDay,
      repeatedFromId: task.id,
    })
    .onConflictDoNothing({ target: schema.tasks.repeatedFromId })
    .returning({ id: schema.tasks.id, dueDate: schema.tasks.dueDate });
  return next ?? null;
}
