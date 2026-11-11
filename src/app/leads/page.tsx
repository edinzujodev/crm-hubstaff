import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ConvertLeadButton } from "@/components/convert-lead-button";
import { LeadMenu } from "@/components/lead-menu";
import { LeadStatusSelect } from "@/components/lead-status-select";
import { NewLeadForm } from "@/components/new-lead-form";
import { pageGuard } from "@/lib/auth";

const FILTERS = [
  ["", "Open"],
  ["won", "Won"],
  ["lost", "Lost"],
  ["all", "All"],
] as const;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function LeadList({ filter }: { filter: Promise<string | undefined> }) {
  await connection();
  await pageGuard("super_admin");
  const show = await filter;
  const [rows, users] = await Promise.all([
    db
      .select({ lead: schema.leads, ownerName: schema.users.name })
      .from(schema.leads)
      .leftJoin(schema.users, eq(schema.leads.ownerId, schema.users.id))
      .orderBy(desc(schema.leads.createdAt)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(schema.users.name),
  ]);

  const isOpen = (s: schema.Lead["status"]) => s !== "won" && s !== "lost";
  const open = rows.filter(({ lead }) => isOpen(lead.status));
  const pipeline = open.reduce((n, { lead }) => n + (lead.expectedMonthlyValue ?? 0), 0);
  const won = rows.filter(({ lead }) => lead.status === "won").length;
  const lost = rows.filter(({ lead }) => lead.status === "lost").length;
  const decided = won + lost;

  const visible = rows.filter(({ lead }) => {
    if (show === "all") return true;
    if (show === "won" || show === "lost") return lead.status === show;
    return isOpen(lead.status);
  });

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-muted">Open leads</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{open.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Open pipeline (per month)</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">{money.format(pipeline)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Win rate</p>
          <p className="mt-1 font-mono text-2xl tabular-nums">
            {decided ? `${Math.round((won / decided) * 100)}%` : "—"}{" "}
            <span className="text-sm text-muted">
              {won} won · {lost} lost
            </span>
          </p>
        </div>
      </section>

      <NewLeadForm users={users} />

      <div className="flex gap-3 text-sm">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/leads?show=${key}` : "/leads"}
            className={(show ?? "") === key ? "font-semibold underline" : "text-muted"}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Lead</th>
              <th className="px-3 py-2 font-medium">Contact</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 text-right font-medium">Est. / month</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ lead, ownerName }) => (
              <tr key={lead.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted">{[lead.contactName, lead.email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2 text-muted">{lead.source ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{ownerName ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {lead.expectedMonthlyValue != null ? money.format(lead.expectedMonthlyValue) : "—"}
                </td>
                <td className="px-3 py-2">
                  {lead.status === "won" ? (
                    <Link href={`/clients/${lead.clientId}`} className="badge border-emerald-500 text-emerald-700 dark:text-emerald-400">
                      Client →
                    </Link>
                  ) : (
                    <LeadStatusSelect leadId={lead.id} status={lead.status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {lead.status !== "won" && <ConvertLeadButton compact leadId={lead.id} name={lead.name} />}
                    <LeadMenu leadId={lead.id} name={lead.name} converted={lead.status === "won"} />
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No leads here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const filter = searchParams.then((p) => (typeof p.show === "string" ? p.show : undefined));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Leads</h1>
      <Suspense fallback={<p className="text-muted">Loading leads…</p>}>
        <LeadList filter={filter} />
      </Suspense>
    </div>
  );
}
