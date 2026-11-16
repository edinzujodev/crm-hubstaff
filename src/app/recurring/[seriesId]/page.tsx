import { DataGrid } from "@/components/data-grid";
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

const statusLabel = { todo: "Open", in_progress: "Open", review: "On review", done: "Done" } as const;

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
  const average = doneOnes.length
    ? Math.round(doneOnes.reduce((n, o) => n + o.trackedSeconds, 0) / doneOnes.length)
    : 0;
  const maxSeconds = Math.max(1, ...occurrences.map((o) => o.trackedSeconds));
  // Newest first.
  const rows = [...occurrences].reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{summary.title}</h1>
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

      <DataGrid
        headers={["Period", "Due", "Status", "Assignee", "Finished", "Time"]}
        rows={rows.map((o) => ({
          key: o.id,
          cells: [
            <div key="p">
              <Link href={`/tasks/${o.id}`} className="font-medium hover:underline">
                {repeat && o.dueDate ? periodLabel(repeat, o.dueDate) : o.title}
              </Link>
              {o.startDate && o.startDate > today && o.status !== "done" && (
                <span className="badge ml-2 text-muted">Starts {fmtDay(o.startDate)}</span>
              )}
            </div>,
            <span key="d" className="text-muted">
              {o.dueDate ? fmtDay(o.dueDate) : "—"}
            </span>,
            <span key="s" className="badge">
              {statusLabel[o.status]}
            </span>,
            <span key="a" className="text-muted">
              {o.assigneeName ?? "—"}
            </span>,
            <span key="f" className="text-muted">
              {o.doneAt ? fmtDateTime(o.doneAt, config.timeZone) : "—"}
            </span>,
            <div key="t" className="flex items-center gap-2">
              <span className="w-16 font-mono tabular-nums">
                {o.trackedSeconds ? fmtDuration(o.trackedSeconds) : "—"}
              </span>
              <span
                aria-hidden
                className="h-2 rounded-full bg-(--series-1)"
                style={{ width: `${Math.round((o.trackedSeconds / maxSeconds) * 120)}px` }}
              />
            </div>,
          ],
        }))}
      />
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
