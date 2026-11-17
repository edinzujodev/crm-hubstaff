import { BackButton } from "@/components/back-button";
import { DataGrid } from "@/components/data-grid";
import { Button } from "@/components/ui";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ClientActions } from "@/components/client-actions";
import { CompanyList } from "@/components/company-list";
import { DateInput } from "@/components/date-input";
import { NewProjectButton, ProjectActions } from "@/components/project-actions";
import { config } from "@/lib/config";
import { fmtDateTime, fmtDay, fmtDuration, localDay } from "@/lib/format";
import { periodLabel } from "@/lib/recurring";
import { KIND_LABEL } from "@/lib/project-kind";
import { getClientReport } from "@/lib/report";
import { pageGuard, taskScope } from "@/lib/auth";

const statusLabel = { todo: "Open", in_progress: "Open", review: "On review", done: "Done" } as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

async function ClientDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const auth = await pageGuard("super_admin", "leader");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, id) });
  if (!client) notFound();

  const tz = config.timeZone;
  const sp = await searchParams;
  const month = localDay(new Date(), tz).slice(0, 7);
  const pick = (v: string | string[] | undefined, fallback: string) =>
    typeof v === "string" && DATE.test(v) ? v : fallback;
  let from = pick(sp.from, `${month}-01`);
  let to = pick(sp.to, lastDayOfMonth(month));
  if (from > to) [from, to] = [to, from];

  const [report, projects, taskTotals, companies, people] = await Promise.all([
    getClientReport(id, from, to, tz, taskScope(auth)),
    db.select().from(schema.projects).where(eq(schema.projects.clientId, id)).orderBy(asc(schema.projects.name)),
    // Every task per project, deleted ones too: they still block deleting the project.
    db
      .select({ projectId: schema.tasks.projectId, n: count() })
      .from(schema.tasks)
      .where(eq(schema.tasks.clientId, id))
      .groupBy(schema.tasks.projectId),
    db
      .select()
      .from(schema.clientCompanies)
      .where(eq(schema.clientCompanies.clientId, id))
      .orderBy(asc(schema.clientCompanies.name)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users),
  ]);
  const totalByProject = new Map(taskTotals.map((r) => [r.projectId, r.n]));
  // Per project: its tasks and the time tracked on them in the period.
  const projectRows = projects.map((p) => {
    const mine = report.tasks.filter((t) => t.task.projectId === p.id);
    return {
      project: p,
      tasks: totalByProject.get(p.id) ?? 0,
      open: mine.filter((t) => t.task.status !== "done" && !t.task.deletedAt).length,
      tracked: mine.reduce((sum, t) => sum + t.tracked, 0),
    };
  });

  const projectName = new Map(projects.map((pr) => [pr.id, pr.name]));
  const personName = new Map(people.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-6">
      <div className="-mb-3">
        <BackButton fallback="/clients" />
      </div>
      <header className="card p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{client.name}</h1>
          {client.kind === "group" && (
            <span className="badge">
              Group of {companies.length} {companies.length === 1 ? "company" : "companies"}
            </span>
          )}
          <ClientActions
            client={{
              id: client.id,
              name: client.name,
              kind: client.kind,
              contactName: client.contactName,
              email: client.email,
              phone: client.phone,
              notes: client.notes,
              hubstaffProjectId: client.hubstaffProjectId,
            }}
            canDelete={auth.role === "super_admin"}
            redirectTo="/clients"
          />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
          {client.contactName && <span>Contact: {client.contactName}</span>}
          {client.email && <span>{client.email}</span>}
          {client.phone && <span>{client.phone}</span>}
          <span>
            {client.hubstaffProjectId
              ? `Hubstaff project #${client.hubstaffProjectId}`
              : config.hubstaffProjectId
                ? `Default Hubstaff project #${config.hubstaffProjectId}`
                : "No Hubstaff project set"}
          </span>
        </p>
        {client.notes && <p className="mt-2 max-w-2xl text-sm">{client.notes}</p>}
      </header>

      <form className="card flex flex-wrap items-end gap-2 p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <DateInput key={from} name="from" defaultValue={from} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <DateInput key={to} name="to" defaultValue={to} />
        </label>
        <Button severity="secondary" outlined className="ml-auto">
          Show
        </Button>
        <Link href={`/reports?client=${id}&from=${from}&to=${to}`} className="btn">
          Full report →
        </Link>
      </form>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Tracked in Hubstaff</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{fmtDuration(report.trackedSeconds)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Activity</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {report.activityPercent === null ? "—" : `${report.activityPercent}%`}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Tasks</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {report.openTaskCount} <span className="text-sm text-muted">open of {report.taskCount}</span>
          </p>
        </div>
      </section>

      {client.kind === "group" && <CompanyList clientId={client.id} companies={companies} />}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Projects</h2>
          <NewProjectButton clientId={client.id} />
        </div>
        <DataGrid
          empty="No projects yet. They are created when you add a task."
          headers={[
            "Project",
            "Type",
            { label: "Open tasks", align: "right" },
            { label: "Tracked in period", align: "right" },
          ]}
          rows={projectRows.map(({ project, tasks, open, tracked }) => ({
            key: project.id,
            cells: [
              <Link
                key="n"
                href={`/reports?project=${project.id}&from=${from}&to=${to}`}
                className="font-medium hover:underline"
              >
                {project.name}
              </Link>,
              <span key="k" className="badge">
                {KIND_LABEL[project.kind]}
              </span>,
              <span key="o" className="font-mono tabular-nums">
                {open} <span className="text-xs text-muted">of {tasks}</span>
              </span>,
              <span key="t" className="font-mono tabular-nums">
                {tracked ? fmtDuration(tracked) : "—"}
              </span>,
            ],
            actions: <ProjectActions id={project.id} name={project.name} kind={project.kind} tasks={tasks} />,
          }))}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tasks</h2>
        <DataGrid
          empty={`No tasks for this client yet. Pick ${client.name} when adding a task on the Tasks page.`}
          headers={[
            "Task",
            "Project",
            "Assignee",
            "Status",
            "Created",
            "Due",
            "Finished",
            { label: "Tracked in period", align: "right" },
            { label: "Activity", align: "right" },
          ]}
          rows={report.tasks
            .filter(({ task }) => !task.deletedAt)
            .map(({ task, tracked, active }) => ({
              key: task.id,
              sort: [
                task.title,
                projectName.get(task.projectId ?? -1) ?? "",
                personName.get(task.assigneeId ?? -1) ?? "",
                statusLabel[task.status],
                task.createdAt.toISOString(),
                task.dueDate ?? "9999-12-31",
                task.doneAt?.toISOString() ?? "9999-12-31",
                tracked,
                tracked ? active / tracked : 0,
              ],
              cells: [
                <div key="n">
                  <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                    {task.title}
                  </Link>
                  {task.repeat && task.dueDate && (
                    <p className="text-xs text-muted">
                      {task.repeat === "weekly" ? "Weekly" : "Monthly"} · {periodLabel(task.repeat, task.dueDate)}
                    </p>
                  )}
                </div>,
                <span key="p" className="text-muted">
                  {projectName.get(task.projectId ?? -1) ?? "—"}
                </span>,
                <span key="a" className="text-muted">
                  {personName.get(task.assigneeId ?? -1) ?? "Unassigned"}
                </span>,
                <div key="s" className="flex flex-wrap items-center gap-1">
                  <span className="badge">{statusLabel[task.status]}</span>
                  {task.reviewResult === "approved" && task.status === "done" && (
                    <span className="badge text-emerald-700 dark:text-emerald-400">Checked: OK</span>
                  )}
                  {task.reviewResult === "rejected" && task.status !== "done" && (
                    <span className="badge text-red-600" title={task.reviewNote ?? undefined}>
                      Checked: not OK
                    </span>
                  )}
                </div>,
                <span key="c" className="whitespace-nowrap text-muted">
                  {fmtDay(localDay(task.createdAt, tz))}
                </span>,
                <span key="d" className="whitespace-nowrap text-muted">
                  {task.dueDate ? fmtDay(task.dueDate) : "—"}
                </span>,
                <span key="f" className="whitespace-nowrap text-muted">
                  {task.doneAt ? fmtDateTime(task.doneAt, tz) : "—"}
                </span>,
                <span key="t" className="font-mono tabular-nums">
                  {tracked ? fmtDuration(tracked) : "—"}
                </span>,
                <span key="x" className="text-xs text-muted">
                  {tracked ? `${Math.round((active / tracked) * 100)}%` : "—"}
                </span>,
              ],
            }))}
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <h2 className="font-semibold">By person</h2>
          <TotalsTable rows={report.byUser.map((r) => ({ label: r.name, ...r }))} />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">By day</h2>
          <TotalsTable rows={report.byDay.map((r) => ({ label: r.day, ...r }))} />
        </div>
      </section>
    </div>
  );
}

function TotalsTable({ rows }: { rows: { label: string; tracked: number; active: number }[] }) {
  return (
    <DataGrid
      noHeader
      empty="No tracked time in this period."
      headers={["", { label: "", align: "right" }, { label: "", align: "right" }]}
      rows={rows.map((r) => ({
        key: r.label,
        cells: [
          r.label,
          <span key="t" className="font-mono tabular-nums">
            {fmtDuration(r.tracked)}
          </span>,
          <span key="a" className="text-xs text-muted">
            {r.tracked ? Math.round((r.active / r.tracked) * 100) : 0}% active
          </span>,
        ],
      }))}
    />
  );
}

export default function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ClientDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
