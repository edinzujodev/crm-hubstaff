import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { trackedByTask } from "@/lib/report";
import type { Repeat } from "@/lib/recurring";

export type Occurrence = {
  id: number;
  title: string;
  status: schema.Task["status"];
  dueDate: string | null;
  startDate: string | null;
  doneAt: Date | null;
  assigneeName: string | null;
  repeat: Repeat | null;
  trackedSeconds: number;
};

export type SeriesSummary = {
  id: number;
  title: string;
  clientId: number | null;
  clientName: string | null;
  /** The repeat of the newest occurrence; null once the series was stopped. */
  repeat: Repeat | null;
  occurrences: number;
  done: number;
  trackedSeconds: number;
  /** Due date of the earliest occurrence that is not done. */
  nextDue: string | null;
  /** The newest occurrence, which is the one to stop repeating on. */
  latestTaskId: number;
};

async function occurrencesBySeries(onlySeriesId?: number) {
  const [rows, tracked] = await Promise.all([
    db
      .select({
        task: schema.tasks,
        clientName: schema.clients.name,
        assigneeName: schema.users.name,
      })
      .from(schema.tasks)
      .leftJoin(schema.clients, eq(schema.tasks.clientId, schema.clients.id))
      .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
      .where(
        and(
          onlySeriesId ? eq(schema.tasks.seriesId, onlySeriesId) : isNotNull(schema.tasks.seriesId),
          isNull(schema.tasks.deletedAt),
        ),
      )
      .orderBy(asc(schema.tasks.dueDate), asc(schema.tasks.id)),
    trackedByTask(),
  ]);

  const bySeries = new Map<number, { occurrences: Occurrence[]; clientId: number | null; clientName: string | null }>();
  for (const { task, clientName, assigneeName } of rows) {
    const group = bySeries.get(task.seriesId!) ?? { occurrences: [], clientId: task.clientId, clientName };
    group.occurrences.push({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      startDate: task.startDate,
      doneAt: task.doneAt,
      assigneeName,
      repeat: task.repeat,
      trackedSeconds: tracked.get(task.id) ?? 0,
    });
    group.clientId = task.clientId;
    group.clientName = clientName;
    bySeries.set(task.seriesId!, group);
  }
  return bySeries;
}

function summarize(id: number, g: { occurrences: Occurrence[]; clientId: number | null; clientName: string | null }): SeriesSummary {
  const latest = g.occurrences[g.occurrences.length - 1];
  return {
    id,
    title: latest.title,
    clientId: g.clientId,
    clientName: g.clientName,
    repeat: latest.repeat,
    occurrences: g.occurrences.length,
    done: g.occurrences.filter((o) => o.status === "done").length,
    trackedSeconds: g.occurrences.reduce((n, o) => n + o.trackedSeconds, 0),
    nextDue: g.occurrences.find((o) => o.status !== "done")?.dueDate ?? null,
    latestTaskId: latest.id,
  };
}

export async function listSeries(): Promise<SeriesSummary[]> {
  const bySeries = await occurrencesBySeries();
  return [...bySeries].map(([id, g]) => summarize(id, g)).sort((a, b) => a.title.localeCompare(b.title));
}

export async function getSeries(id: number) {
  const g = (await occurrencesBySeries(id)).get(id);
  if (!g) return null;
  return { summary: summarize(id, g), occurrences: g.occurrences };
}
