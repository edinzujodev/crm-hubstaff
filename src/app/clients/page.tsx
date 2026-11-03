import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { NewClientForm } from "@/components/new-client-form";
import { config } from "@/lib/config";
import { fmtDuration, localDay } from "@/lib/format";
import { trackedByClient } from "@/lib/report";

async function ClientList() {
  await connection();
  const monthStart = `${localDay(new Date(), config.timeZone).slice(0, 7)}-01`;
  const [clients, taskCounts, tracked] = await Promise.all([
    db.select().from(schema.clients).orderBy(asc(schema.clients.name)),
    db
      .select({ clientId: schema.tasks.clientId, n: count() })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.status, "in_progress"), isNull(schema.tasks.deletedAt)))
      .groupBy(schema.tasks.clientId),
    trackedByClient(new Date(Date.parse(monthStart))),
  ]);
  const inProgress = new Map(taskCounts.map((r) => [r.clientId, r.n]));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">Contact</th>
            <th className="px-3 py-2 text-right font-medium">In progress</th>
            <th className="px-3 py-2 text-right font-medium">Tracked this month</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">{[c.contactName, c.email].filter(Boolean).join(" · ") || "—"}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{inProgress.get(c.id) ?? 0}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {tracked.get(c.id) ? fmtDuration(tracked.get(c.id)!) : "—"}
              </td>
            </tr>
          ))}
          {clients.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted">
                No clients yet. Add the first one above.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ClientsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Clients</h1>
      <NewClientForm />
      <Suspense fallback={<p className="text-muted">Loading clients…</p>}>
        <ClientList />
      </Suspense>
    </div>
  );
}
