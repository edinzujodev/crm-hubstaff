import { DataGrid } from "@/components/data-grid";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { NextPeriodButton } from "@/components/next-period-button";
import { SeriesActions } from "@/components/series-actions";
import { TabCard } from "@/components/tab-card";
import { config } from "@/lib/config";
import { fmtDateTime, fmtDay, fmtDuration, localDay } from "@/lib/format";
import { nextHidden, periodLabel, upcomingCopies } from "@/lib/recurring";
import { getSeries } from "@/lib/series";
import { pageGuard } from "@/lib/auth";

const statusLabel = { todo: "Open", in_progress: "Open", review: "On review", done: "Done" } as const;

/** One recurring task as a whole: all its copies, and the actions that apply to every copy. */
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

  const current = [...occurrences].reverse().find((o) => !(o.startDate && o.startDate > today));
  const next = summary.repeat
    ? nextHidden((await upcomingCopies([id], today)).get(id), current?.dueDate ?? null)
    : null;

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{summary.title}</h1>
            <span className={`badge ${summary.repeat ? "" : "text-muted"}`}>
              {summary.repeat ? `Repeats ${summary.repeat}` : "Stopped repeating"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Client:{" "}
            {summary.clientId ? (
              <Link href={`/clients/${summary.clientId}`} className="underline">
                {summary.clientName}
              </Link>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SeriesActions
            seriesId={id}
            latestTaskId={summary.latestTaskId}
            title={summary.title}
            repeating={!!summary.repeat}
            count={summary.occurrences}
          />
        </div>
      </section>

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

      <TabCard
        padded
        active={0}
        tabs={[{ label: "Occurrences", href: `/recurring/${id}`, count: occurrences.length }]}
      >
        <div className="space-y-3">
          {next && repeat && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span>
                {periodLabel(repeat, next.dueDate)} is created but hidden until its time comes. Need it earlier?
              </span>
              <NextPeriodButton nextTaskId={next.id} label={periodLabel(repeat, next.dueDate)} />
            </div>
          )}
          <DataGrid
            flush
            headers={["Period", "Due", "Status", "Assignee", "Finished", "Time"]}
            rows={rows.map((o) => ({
              key: o.id,
              cells: [
                <div key="p">
                  <Link href={`/tasks/${o.id}`} className="font-medium hover:underline">
                    {repeat && o.dueDate ? periodLabel(repeat, o.dueDate) : o.title}
                  </Link>
                  {o.startDate && o.startDate > today && o.status !== "done" && (
                    <span className="badge ml-2 text-muted">Hidden until {fmtDay(o.startDate)}</span>
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
      </TabCard>
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
