import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BarList } from "@/components/charts/bar-list";
import { ChartTip } from "@/components/charts/chart-tip";
import { ColumnChart } from "@/components/charts/column-chart";
import { LineChart } from "@/components/charts/line-chart";
import { LoadRangeButton } from "@/components/load-range-button";
import { RangeSelect } from "@/components/range-select";
import { pct, toBars } from "@/lib/bars";
import { config } from "@/lib/config";
import { longDay } from "@/lib/chart";
import { fmtDuration } from "@/lib/format";
import { parseReportParams, rangePresets, reportQuery } from "@/lib/report-range";
import { dailySeries, getTimeReport, type Row } from "@/lib/time-report";
import { pageGuard } from "@/lib/auth";

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

function Charts({ report, from, to }: { report: Awaited<ReturnType<typeof getTimeReport>>; from: string; to: string }) {
  const days = dailySeries(report, from, to);
  // Only worth a chart when there is a real team to compare (not just "No team").
  const showTeams = report.byTeam.some((r) => r.href);
  const columns = days.map((d) => ({
    key: d.day,
    label: fmtDuration(d.tracked),
    value: d.tracked / 3600,
    tip: `${fmtDuration(d.tracked)}
${longDay(d.day)}
Billable ${fmtDuration(d.billable)} · Activity ${pct(d.tracked, d.active)}`,
  }));
  const activity = days.map((d) => ({
    key: d.day,
    value: d.tracked ? Math.round((d.active / d.tracked) * 100) : null,
    tip: d.tracked
      ? `${pct(d.tracked, d.active)} active
${longDay(d.day)}
${fmtDuration(d.tracked)} tracked`
      : `No time tracked
${longDay(d.day)}`,
  }));

  return (
    <ChartTip>
      <div className="space-y-6">
        <section className="card p-4">
          <h2 className="font-semibold">Hours per day</h2>
          <p className="mb-2 text-xs text-muted">Time tracked in Hubstaff each day. The tallest day is labelled.</p>
          <ColumnChart data={columns} ariaLabel={`Hours tracked per day from ${from} to ${to}. The same numbers are in the By day table below.`} />
        </section>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="card p-4">
            <h2 className="font-semibold">Time by client</h2>
            <p className="mb-3 text-xs text-muted">Share of tracked time, largest first.</p>
            <BarList data={toBars(report.byClient, report.total.tracked)} />
          </section>
          <section className="card p-4">
            <h2 className="font-semibold">Time by project</h2>
            <p className="mb-3 text-xs text-muted">Share of tracked time, largest first.</p>
            <BarList data={toBars(report.byProject, report.total.tracked)} />
          </section>
          {showTeams && (
            <section className="card p-4">
              <h2 className="font-semibold">Time by team</h2>
              <p className="mb-3 text-xs text-muted">Share of tracked time, largest first.</p>
              <BarList data={toBars(report.byTeam, report.total.tracked)} />
            </section>
          )}
          <section className="card p-4">
            <h2 className="font-semibold">Time by person</h2>
            <p className="mb-3 text-xs text-muted">Share of tracked time, largest first.</p>
            <BarList data={toBars(report.byUser, report.total.tracked)} />
          </section>
        </div>

        <section className="card p-4">
          <h2 className="font-semibold">Activity per day</h2>
          <p className="mb-2 text-xs text-muted">
            Share of tracked time with keyboard or mouse activity. Days with no tracked time leave a gap.
          </p>
          <LineChart data={activity} ariaLabel={`Activity percentage per day from ${from} to ${to}. The same numbers are in the By day table below.`} />
        </section>
      </div>
    </ChartTip>
  );
}

async function Report({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const tz = config.timeZone;
  const parsed = parseReportParams(await searchParams, tz);
  // A team leader's reports are always limited to their own team.
  const filter = auth.role === "leader" ? { ...parsed, teamId: auth.ledTeam!.id } : parsed;
  const [report, clients, allProjects, allUsers, allTeams] = await Promise.all([
    getTimeReport(filter),
    db.select({ id: schema.clients.id, name: schema.clients.name }).from(schema.clients).orderBy(asc(schema.clients.name)),
    db
      .select({ id: schema.projects.id, name: schema.projects.name, clientName: schema.clients.name })
      .from(schema.projects)
      .innerJoin(schema.clients, eq(schema.projects.clientId, schema.clients.id))
      .orderBy(asc(schema.clients.name), asc(schema.projects.name)),
    db.select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId }).from(schema.users).orderBy(asc(schema.users.name)),
    db.select({ id: schema.teams.id, name: schema.teams.name }).from(schema.teams).orderBy(asc(schema.teams.name)),
  ]);
  const users = auth.role === "leader" ? allUsers.filter((u) => u.teamId === auth.ledTeam!.id) : allUsers;
  const teams = auth.role === "leader" ? allTeams.filter((t) => t.id === auth.ledTeam!.id) : allTeams;
  const presets = rangePresets(tz);

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
          Project
          <select name="project" defaultValue={filter.projectId ?? ""} className="input text-foreground">
            <option value="">All projects</option>
            {allProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clientName} / {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Team
          <select name="team" defaultValue={filter.teamId ?? ""} className="input text-foreground">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
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
      </form>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <RangeSelect
          options={presets.map((p) => ({
            label: p.label,
            href: `/reports?${reportQuery({ ...filter, from: p.from, to: p.to })}`,
            selected: p.from === filter.from && p.to === filter.to,
          }))}
        />
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

      <Charts report={report} from={filter.from} to={filter.to} />

      <h2 className="pt-2 text-lg font-semibold">Tables</h2>
      <section className="grid gap-6 md:grid-cols-2">
        <Table title="By client" rows={report.byClient} firstColumn="Client" />
        <Table title="By project" rows={report.byProject} firstColumn="Client / Project" />
        <Table title="By person" rows={report.byUser} firstColumn="Person" />
      </section>
      {report.byTeam.some((r) => r.href) && (
        <section className="grid gap-6 md:grid-cols-2">
          <Table title="By team" rows={report.byTeam} firstColumn="Team" />
        </section>
      )}

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
      <h1 className="sr-only">Reports</h1>
      <Suspense fallback={<p className="text-muted">Loading report…</p>}>
        <Report searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
