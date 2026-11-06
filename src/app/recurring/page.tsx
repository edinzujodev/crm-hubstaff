import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { fmtDay, fmtDuration } from "@/lib/format";
import { listSeries } from "@/lib/series";

const repeatLabel = { weekly: "Weekly", monthly: "Monthly" } as const;

async function SeriesList() {
  await connection();
  const series = await listSeries();

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Task</th>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Repeats</th>
            <th className="px-3 py-2 text-right font-medium">Done</th>
            <th className="px-3 py-2 text-right font-medium">Total time</th>
            <th className="px-3 py-2 font-medium">Next due</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/recurring/${s.id}`} className="font-medium hover:underline">
                  {s.title}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">
                {s.clientId ? (
                  <Link href={`/clients/${s.clientId}`} className="hover:underline">
                    {s.clientName}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2">
                {s.repeat ? <span className="badge">{repeatLabel[s.repeat]}</span> : <span className="badge text-muted">Stopped</span>}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {s.done} / {s.occurrences}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {s.trackedSeconds ? fmtDuration(s.trackedSeconds) : "—"}
              </td>
              <td className="px-3 py-2 text-muted">{s.nextDue ? fmtDay(s.nextDue) : "—"}</td>
            </tr>
          ))}
          {series.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted">
                No recurring tasks yet. Add a task and answer Yes to &quot;Is this task recurring?&quot;
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RecurringPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Recurring tasks</h1>
        <p className="text-sm text-muted">Each row is one repeating task. Open it to see every time it was done.</p>
      </div>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <SeriesList />
      </Suspense>
    </div>
  );
}
