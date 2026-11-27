import { ListSkeleton } from "@/components/page-skeleton";
import { TabCard } from "@/components/tab-card";
import { DataGrid } from "@/components/data-grid";
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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

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
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .orderBy(schema.users.name),
  ]);

  const isOpen = (s: schema.Lead["status"]) => s !== "won" && s !== "lost";
  const open = rows.filter(({ lead }) => isOpen(lead.status));
  const pipeline = open.reduce(
    (n, { lead }) => n + (lead.expectedMonthlyValue ?? 0),
    0,
  );
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
          <p className="mt-1 text-2xl tabular-nums">{open.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Open pipeline (per month)</p>
          <p className="mt-1 text-2xl tabular-nums">
            {money.format(pipeline)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted">Win rate</p>
          <p className="mt-1 text-2xl tabular-nums">
            {decided ? `${Math.round((won / decided) * 100)}%` : "—"}{" "}
            <span className="text-sm text-muted">
              {won} won · {lost} lost
            </span>
          </p>
        </div>
      </section>

      <NewLeadForm users={users} />

      <TabCard
        tabs={FILTERS.map(([key, label]) => ({
          label,
          href: key ? `/leads?show=${key}` : "/leads",
        }))}
        active={Math.max(
          0,
          FILTERS.findIndex(([key]) => key === (show ?? "")),
        )}
      >
        <DataGrid
          flush
          empty="No leads here."
          headers={[
            "Lead",
            "Contact",
            "Source",
            "Owner",
            { label: "Est. / month", align: "right" },
            "Status",
          ]}
          rows={visible.map(({ lead, ownerName }) => ({
            key: lead.id,
            cells: [
              <Link
                key="l"
                href={`/leads/${lead.id}`}
                className="font-medium hover:underline"
              >
                {lead.name}
              </Link>,
              <span key="c" className="text-muted">
                {[lead.contactName, lead.email].filter(Boolean).join(" · ") ||
                  "—"}
              </span>,
              <span key="s" className="text-muted">
                {lead.source ?? "—"}
              </span>,
              <span key="o" className="text-muted">
                {ownerName ?? "—"}
              </span>,
              <span key="m" className="tabular-nums">
                {lead.expectedMonthlyValue != null
                  ? money.format(lead.expectedMonthlyValue)
                  : "—"}
              </span>,
              lead.status === "won" ? (
                <Link
                  key="st"
                  href={`/clients/${lead.clientId}`}
                  className="badge border-emerald-500 text-emerald-700 dark:text-emerald-400"
                >
                  Client →
                </Link>
              ) : (
                <LeadStatusSelect
                  key="st"
                  leadId={lead.id}
                  status={lead.status}
                />
              ),
            ],
            actions: (
              <>
                {lead.status !== "won" && (
                  <ConvertLeadButton
                    compact
                    leadId={lead.id}
                    name={lead.name}
                  />
                )}
                <LeadMenu lead={lead} users={users} />
              </>
            ),
          }))}
        />
      </TabCard>
    </div>
  );
}

export default function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const filter = searchParams.then((p) =>
    typeof p.show === "string" ? p.show : undefined,
  );
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Leads</h1>
      <Suspense fallback={<ListSkeleton />}>
        <LeadList filter={filter} />
      </Suspense>
    </div>
  );
}
