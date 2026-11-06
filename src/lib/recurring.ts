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

/** `YYYY-MM-DD` minus `days` days. */
export function subtractDays(day: string, days: number): string {
  const { y, m, d } = parse(day);
  const t = new Date(Date.UTC(y, m - 1, d - days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** How many days before the due date a copy appears in the lists, when the user didn't choose. */
export const defaultLeadDays = (repeat: Repeat) => (repeat === "weekly" ? 2 : 7);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The period a repeating task covers, from its due date: "Nov 2026" or "Week of 9 Nov 2026". */
export function periodLabel(repeat: Repeat, dueDate: string): string {
  const { y, m, d } = parse(dueDate);
  return repeat === "monthly" ? `${MONTHS[m - 1]} ${y}` : `Week of ${d} ${MONTHS[m - 1]} ${y}`;
}

/** The Hubstaff task name: "Acme: Do taxes – Nov 2026 [CRM #123]". Repeating tasks carry their period. */
export function hubstaffSummary(
  task: { id: number; title: string; repeat: Repeat | null; dueDate: string | null },
  clientName?: string | null,
): string {
  const period = task.repeat && task.dueDate ? ` – ${periodLabel(task.repeat, task.dueDate)}` : "";
  return `${clientName ? `${clientName}: ` : ""}${task.title}${period} [CRM #${task.id}]`;
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
  const seriesId = task.seriesId ?? task.id;
  if (!task.seriesId) await db.update(schema.tasks).set({ seriesId }).where(eq(schema.tasks.id, task.id));
  const dueDate = nextDueDate(task.dueDate, task.repeat, task.repeatDay, today);
  // The copy stays out of the open-task lists until `repeatLeadDays` before it is due.
  const startDate = subtractDays(dueDate, task.repeatLeadDays ?? defaultLeadDays(task.repeat));
  const [next] = await db
    .insert(schema.tasks)
    .values({
      title: task.title,
      description: task.description,
      clientId: task.clientId,
      assigneeId: task.assigneeId,
      dueDate,
      startDate: startDate > today ? startDate : null,
      repeat: task.repeat,
      repeatDay: task.repeatDay,
      repeatLeadDays: task.repeatLeadDays,
      seriesId,
      repeatedFromId: task.id,
    })
    .onConflictDoNothing({ target: schema.tasks.repeatedFromId })
    .returning({ id: schema.tasks.id, dueDate: schema.tasks.dueDate });
  return next ?? null;
}
