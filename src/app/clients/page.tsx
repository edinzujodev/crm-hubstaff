import { ListSkeleton } from "@/components/page-skeleton";
import { DataGrid } from "@/components/data-grid";
import { TabCard } from "@/components/tab-card";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, asc, count, isNull, lte, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ClientActions } from "@/components/client-actions";
import { NewClientForm } from "@/components/new-client-form";
import { config } from "@/lib/config";
import { fmtDuration, localDay } from "@/lib/format";
import { trackedByClient } from "@/lib/report";
import { pageGuard, taskScope } from "@/lib/auth";

async function ClientList({ show }: { show?: string }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const scope = taskScope(auth);
  const monthStart = `${localDay(new Date(), config.timeZone).slice(0, 7)}-01`;
  const [allClients, taskCounts, tracked, projectCounts, companyNameRows] = await Promise.all([
    db.select().from(schema.clients).orderBy(asc(schema.clients.name)),
    db
      .select({ clientId: schema.tasks.clientId, n: count() })
      .from(schema.tasks)
      .where(
        and(
          ne(schema.tasks.status, "done"),
          isNull(schema.tasks.deletedAt),
          or(isNull(schema.tasks.startDate), lte(schema.tasks.startDate, localDay(new Date(), config.timeZone))),
          scope,
        ),
      )
      .groupBy(schema.tasks.clientId),
    trackedByClient(new Date(Date.parse(monthStart)), scope),
    db
      .select({ clientId: schema.projects.clientId, n: count() })
      .from(schema.projects)
      .groupBy(schema.projects.clientId),
    db
      .select({ clientId: schema.clientCompanies.clientId, name: schema.clientCompanies.name })
      .from(schema.clientCompanies)
      .orderBy(asc(schema.clientCompanies.name)),
  ]);
  const companyNames = new Map<number, string[]>();
  for (const r of companyNameRows) companyNames.set(r.clientId, [...(companyNames.get(r.clientId) ?? []), r.name]);
  const tabs = [
    ["", "All", allClients.length],
    ["companies", "Companies", allClients.filter((c) => c.kind === "company").length],
    ["groups", "Groups", allClients.filter((c) => c.kind === "group").length],
  ] as const;
  const clients = allClients.filter((c) =>
    show === "groups" ? c.kind === "group" : show === "companies" ? c.kind === "company" : true,
  );
  const projectsOf = new Map(projectCounts.map((r) => [r.clientId, r.n]));
  const inProgress = new Map(taskCounts.map((r) => [r.clientId, r.n]));

  return (
    <TabCard
      tabs={tabs.map(([key, label, n]) => ({ label, href: key ? `/clients?show=${key}` : "/clients", count: n }))}
      active={Math.max(
        0,
        tabs.findIndex(([key]) => key === (show ?? "")),
      )}
    >
      <DataGrid
        flush
        empty="No clients here yet."
        headers={[
          "Client",
          "Group",
          "Contact",
          { label: "Open tasks", align: "right" },
          { label: "Projects", align: "right" },
          { label: "Tracked this month", align: "right" },
        ]}
        rows={clients.map((c) => ({
          key: c.id,
          cells: [
            <div key="c">
              <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                {c.name}
              </Link>
            </div>,
            <span key="g" className="text-muted">
              {c.kind === "group" ? (companyNames.get(c.id) ?? []).join(", ") || "No companies yet" : "—"}
            </span>,
            <span key="k" className="text-muted">
              {[c.contactName, c.email].filter(Boolean).join(" · ") || "—"}
            </span>,
            <span key="o" className="font-mono tabular-nums">
              {inProgress.get(c.id) ?? 0}
            </span>,
            <span key="p" className="font-mono tabular-nums">
              {projectsOf.get(c.id) ?? 0}
            </span>,
            <span key="t" className="font-mono tabular-nums">
              {tracked.get(c.id) ? fmtDuration(tracked.get(c.id)!) : "—"}
            </span>,
          ],
          actions: (
            <ClientActions
              client={{
                id: c.id,
                name: c.name,
                kind: c.kind,
                contactName: c.contactName,
                email: c.email,
                phone: c.phone,
                notes: c.notes,
                hubstaffProjectId: c.hubstaffProjectId,
              }}
              canDelete={auth.role === "super_admin"}
            />
          ),
        }))}
      />
    </TabCard>
  );
}

async function ClientListLoader({ show }: { show: Promise<string | undefined> }) {
  return <ClientList show={await show} />;
}

export default function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const show = searchParams.then((p) => (typeof p.show === "string" ? p.show : undefined));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Clients</h1>
      <NewClientForm />
      <Suspense fallback={<ListSkeleton />}>
        <ClientListLoader show={show} />
      </Suspense>
    </div>
  );
}
