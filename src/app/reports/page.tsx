import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { LoadRangeButton } from "@/components/load-range-button";
import { config } from "@/lib/config";
import { fmtDuration } from "@/lib/format";
import { parseReportParams, rangePresets, reportQuery } from "@/lib/report-range";
import { getTimeReport, type Row } from "@/lib/time-report";

const pct = (tracked: number, active: number) => (tracked ? `${Math.round((active / tracked) * 100)}%` : "—");

function Table({ title, rows, firstColumn }: { title: string; rows: Row[]; firstColumn: string }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">{firstColumn}</th>
              <th className="px-3 py-2 text-right font-medium">Tracked</th>
              <th className="px-3 py-2 text-right font-medium">Billable</th>
              <th className="px-3 py-2 text-right font-medium">Activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  {r.href ? (
                    <Link href={r.href} className="hover:underline">
                      {r.label}
                    </Link>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtDuration(r.tracked)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">{fmtDuration(r.billable)}</td>
                <td className="px-3 py-2 text-right text-xs text-muted">{pct(r.tracked, r.active)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted">
                  No tracked time in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Report({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await connection();
  const tz = config.timeZone;
  const filter = parseReportParams(await searchParams, tz);
  const [report, clients, users] = await Promise.all([
    getTimeReport(filter),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(asc(schema.users.name)),
  ]);
  const presets = rangePresets(tz);
  const query = reportQuery(filter);

  return (
    <div className="space-y-6">
      <form className="card flex flex-wrap items-end gap-2 p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={filter.from} className="input text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={filter.to} className="input text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Client
          <select name="client" defaultValue={filter.clientId ?? ""} className="input text-foreground">
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Person
          <select name="user" defaultValue={filter.userId ?? ""} className="input text-foreground">
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary">Show</button>
        <a href={`/reports/export?${query}`} className="btn" download>
          Download CSV
        </a>
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={`/reports?${reportQuery({ ...filter, from: p.from, to: p.to })}`}
            className={p.from === filter.from && p.to === filter.to ? "font-semibold underline" : "text-muted hover:underline"}
          >
            {p.label}
          </Link>
        ))}
        <span className="ml-auto">
          <LoadRangeButton from={filter.from} to={filter.to} />
        </span>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-xs text-muted">Tracked</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{fmtDuration(report.total.tracked)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Billable</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{fmtDuration(report.total.billable)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Activity</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {report.activityPercent === null ? "—" : `${report.activityPercent}%`}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Days with time</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{report.daysWorked}</p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Table title="By client" rows={report.byClient} firstColumn="Client" />
        <Table title="By person" rows={report.byUser} firstColumn="Person" />
      </section>

      {report.people.length > 1 && report.byClient.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Client by person</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  {report.people.map((p) => (
                    <th key={p.key} className="px-3 py-2 text-right font-medium">
                      {p.label}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.matrix.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      {row.href ? (
                        <Link href={row.href} className="hover:underline">
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    {row.cells.map((c, i) => (
                      <td key={i} className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                        {c.tracked ? fmtDuration(c.tracked) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtDuration(row.tracked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        <Table title="By task" rows={report.byTask} firstColumn="Task" />
        <Table title="By day" rows={report.byDay} firstColumn="Day" />
      </section>

      <p className="text-xs text-muted">
        Times are in {tz}. Hours come from Hubstaff, so they can be about 20 minutes late. Time that did not land on a
        CRM task is listed under &quot;{`Not on a CRM client`}&quot; so the totals match Hubstaff.
      </p>
    </div>
  );
}

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Reports</h1>
      <Suspense fallback={<p className="text-muted">Loading report…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
