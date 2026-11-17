import { DetailSkeleton } from "@/components/page-skeleton";
import { Crumb } from "@/components/crumb";
import { BackButton } from "@/components/back-button";
import { DataGrid } from "@/components/data-grid";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { InfoItem } from "@/components/info-item";
import { NextPeriodButton } from "@/components/next-period-button";
import { SeriesActions } from "@/components/series-actions";
import { TabCard } from "@/components/tab-card";
import { TaskChecklist } from "@/components/task-checklist";
import { config } from "@/lib/config";
import { canManageTask, pageGuard } from "@/lib/auth";
import { fmtDateTime, fmtDay, fmtDuration, localDay } from "@/lib/format";
import { KIND_LABEL } from "@/lib/project-kind";
import { nextHidden, periodLabel, upcomingCopies } from "@/lib/recurring";
import { getSeries } from "@/lib/series";

const statusLabel = { todo: "Open", in_progress: "Open", review: "On review", done: "Done" } as const;

/** A recurring task as a whole, laid out like a single task: header, facts, then tabs. */
async function SeriesDetail({
  params,
  searchParams,
}: {
  params: Promise<{ seriesId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
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

  // The copy people are working on now: the oldest one that is showing and not done, else the newest showing.
  const showing = occurrences.filter((o) => !(o.startDate && o.startDate > today));
  const current = showing.find((o) => o.status !== "done") ?? showing[showing.length - 1] ?? rows[0];
  const next = summary.repeat
    ? nextHidden((await upcomingCopies([id], today)).get(id), current.dueDate)
    : null;

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, current.id));
  const [project, team, checklist] = await Promise.all([
    task.projectId ? db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) }) : null,
    task.teamId ? db.query.teams.findFirst({ where: eq(schema.teams.id, task.teamId) }) : null,
    db
      .select()
      .from(schema.taskChecklistItems)
      .where(eq(schema.taskChecklistItems.taskId, task.id))
      .orderBy(asc(schema.taskChecklistItems.position), asc(schema.taskChecklistItems.id)),
  ]);

  const tabList = [
    { key: "occurrences", label: "Occurrences", count: occurrences.length },
    { key: "checklist", label: "Checklist" },
    { key: "time", label: "Time" },
  ];
  const wanted = (await searchParams).tab;
  const activeTab = Math.max(
    0,
    tabList.findIndex((t) => t.key === wanted),
  );
  const tab = tabList[activeTab].key;

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallback="/tasks?show=recurring" />
      </div>
      <section className="card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{summary.title}</h1>
          <Crumb name={summary.title} />
            <span className="badge">{summary.repeat ? `Repeats ${summary.repeat}` : "Stopped repeating"}</span>
          </div>
          <p className="text-sm text-muted">
            {summary.occurrences} {summary.occurrences === 1 ? "occurrence" : "occurrences"} · {summary.done} done
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

      <section className="card grid grid-cols-2 gap-px overflow-hidden bg-border sm:grid-cols-3">
        <InfoItem icon="pi-tag" label="Kind of task">
          {summary.repeat ? (summary.repeat === "weekly" ? "Weekly, repeats" : "Monthly, repeats") : "Stopped"}
        </InfoItem>
        <InfoItem icon="pi-briefcase" label="Client">
          {summary.clientId ? (
            <Link href={`/clients/${summary.clientId}`} className="hover:underline">
              {summary.clientName}
            </Link>
          ) : (
            "—"
          )}
        </InfoItem>
        <InfoItem icon="pi-folder" label="Project">
          {project ? `${project.name} · ${KIND_LABEL[project.kind]}` : "—"}
        </InfoItem>
        <InfoItem icon="pi-users" label="Team">
          {team?.name ?? "—"}
        </InfoItem>
        <InfoItem icon="pi-user" label="Assignee">
          {current.assigneeName ?? "Unassigned"}
        </InfoItem>
        <InfoItem icon="pi-calendar" label="Next due">
          {summary.nextDue ? fmtDay(summary.nextDue) : "—"}
        </InfoItem>
      </section>

      <TabCard
        padded
        active={activeTab}
        tabs={tabList.map((t) => ({
          label: t.label,
          count: "count" in t ? t.count : undefined,
          href: t.key === "occurrences" ? `/recurring/${id}` : `/recurring/${id}?tab=${t.key}`,
        }))}
      >
        <div className="space-y-6">
          {tab === "occurrences" && (
            <section className="space-y-3">
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
                      {o.id === current.id && <span className="badge ml-2 text-muted">Current</span>}
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
            </section>
          )}

          {tab === "checklist" && (
            <>
              <p className="text-sm text-muted">
                This is the checklist of the current copy
                {repeat && current.dueDate ? ` (${periodLabel(repeat, current.dueDate)})` : ""}.
              </p>
              <TaskChecklist
                taskId={task.id}
                description={task.description}
                items={checklist.map((c) => ({ id: c.id, text: c.text, done: c.doneAt !== null }))}
                canEdit={canManageTask(auth, task) && !task.deletedAt}
                canTick={!task.deletedAt && task.status !== "done"}
              />
            </>
          )}

          {tab === "time" && (
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
          )}
        </div>
      </TabCard>
    </div>
  );
}

export default function SeriesPage({ params, searchParams }: PageProps<"/recurring/[seriesId]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <SeriesDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
