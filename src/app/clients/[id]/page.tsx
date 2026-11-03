import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { fmtDuration, localDay } from "@/lib/format";
import { getClientReport } from "@/lib/report";

const statusLabel = { todo: "To do", in_progress: "In progress", done: "Done" } as const;
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
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, id) });
  if (!client) notFound();

  const tz = config.timeZone;
  const sp = await searchParams;
  const month = localDay(new Date(), tz).slice(0, 7);
  const pick = (v: string | string[] | undefined, fallback: string) => (typeof v === "string" && DATE.test(v) ? v : fallback);
  let from = pick(sp.from, `${month}-01`);
  let to = pick(sp.to, lastDayOfMonth(month));
  if (from > to) [from, to] = [to, from];

  const report = await getClientReport(id, from, to, tz);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/clients" className="text-sm text-muted hover:underline">
          ← Clients
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{client.name}</h1>
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
      </div>

      <form className="card flex flex-wrap items-end gap-2 p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={from} className="input text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={to} className="input text-foreground" />
        </label>
        <button className="btn">Show</button>
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

      <section className="space-y-2">
        <h2 className="font-semibold">Tasks</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Tracked in period</th>
                <th className="px-3 py-2 text-right font-medium">Activity</th>
              </tr>
            </thead>
            <tbody>
              {report.tasks.map(({ task, tracked, active }) => (
                <tr key={task.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                      {task.title}
                    </Link>
                    {task.deletedAt && <span className="badge ml-2 text-red-600">Deleted</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="badge">{statusLabel[task.status]}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{tracked ? fmtDuration(tracked) : "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted">
                    {tracked ? `${Math.round((active / tracked) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
              {report.tasks.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted">
                    No tasks for this client yet. Pick {client.name} when adding a task on the Tasks page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
    <div className="card">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{r.label}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtDuration(r.tracked)}</td>
              <td className="px-3 py-2 text-right text-xs text-muted">
                {r.tracked ? Math.round((r.active / r.tracked) * 100) : 0}% active
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-4 text-center text-muted">No tracked time in this period.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <ClientDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
