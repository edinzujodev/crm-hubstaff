import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { StopRepeatingButton } from "@/components/stop-repeating-button";
import { config } from "@/lib/config";
import { fmtDateTime, fmtDay, fmtDuration, localDay } from "@/lib/format";
import { periodLabel } from "@/lib/recurring";
import { getSeries } from "@/lib/series";
import { pageGuard } from "@/lib/auth";

const statusLabel = { todo: "To do", in_progress: "In progress", done: "Done" } as const;

async function SeriesDetail({ params }: { params: Promise<{ seriesId: string }> }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const id = Number((await params).seriesId);
  if (!Number.isInteger(id)) notFound();
  const data = await getSeries(id, auth);
  if (!data) notFound();
  const { summary, occurrences } = data;

  // Period names need the repeat type; use the newest one that still has it.
  const repeat = [...occurrences].reverse().find((o) => o.repeat)?.repeat ?? null;
  const today = localDay(new Date(), config.timeZone);
  const doneOnes = occurrences.filter((o) => o.status === "done");
  const average = doneOnes.length ? Math.round(doneOnes.reduce((n, o) => n + o.trackedSeconds, 0) / doneOnes.length) : 0;
  const maxSeconds = Math.max(1, ...occurrences.map((o) => o.trackedSeconds));
  // Newest first.
  const rows = [...occurrences].reverse();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tasks?show=recurring" className="text-sm text-muted hover:underline">
          ← Recurring tasks
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{summary.title}</h1>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
          <span>
            Client:{" "}
            {summary.clientId ? (
              <Link href={`/clients/${summary.clientId}`} className="underline">
                {summary.clientName}
              </Link>
            ) : (
              "—"
            )}
          </span>
          {summary.repeat ? (
            <span>
              Repeats {summary.repeat} · <StopRepeatingButton taskId={summary.latestTaskId} />
            </span>
          ) : (
            <span>Stopped repeating</span>
          )}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Done</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {summary.done} <span className="text-base text-muted">of {summary.occurrences}</span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Total time</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{fmtDuration(summary.trackedSeconds)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Average per finished one</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{doneOnes.length ? fmtDuration(average) : "—"}</p>
        </div>
      </section>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Period</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Assignee</th>
              <th className="px-3 py-2 font-medium">Finished</th>
              <th className="px-3 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/tasks/${o.id}`} className="font-medium hover:underline">
                    {repeat && o.dueDate ? periodLabel(repeat, o.dueDate) : o.title}
                  </Link>
                  {o.startDate && o.startDate > today && o.status !== "done" && (
                    <span className="badge ml-2 text-muted">Starts {fmtDay(o.startDate)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted">{o.dueDate ? fmtDay(o.dueDate) : "—"}</td>
                <td className="px-3 py-2">
                  <span className="badge">{statusLabel[o.status]}</span>
                </td>
                <td className="px-3 py-2 text-muted">{o.assigneeName ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{o.doneAt ? fmtDateTime(o.doneAt, config.timeZone) : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-16 font-mono tabular-nums">{o.trackedSeconds ? fmtDuration(o.trackedSeconds) : "—"}</span>
                    <span
                      aria-hidden
                      className="h-2 rounded-full bg-(--series-1)"
                      style={{ width: `${Math.round((o.trackedSeconds / maxSeconds) * 120)}px` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SeriesPage({ params }: PageProps<"/recurring/[seriesId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <SeriesDetail params={params} />
    </Suspense>
  );
}
