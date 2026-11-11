import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ConvertLeadButton } from "@/components/convert-lead-button";
import { DeleteLeadButton } from "@/components/delete-lead-button";
import { LeadEditForm } from "@/components/lead-edit-form";
import { config } from "@/lib/config";
import { fmtDateTime } from "@/lib/format";
import { pageGuard } from "@/lib/auth";

async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  await pageGuard("super_admin");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [lead, users] = await Promise.all([
    db.query.leads.findFirst({ where: eq(schema.leads.id, id) }),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).orderBy(schema.users.name),
  ]);
  if (!lead) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{lead.name}</h1>
          <p className="mt-1 text-sm text-muted">
            Added {fmtDateTime(lead.createdAt, config.timeZone)}
            {lead.convertedAt && <> · became a client {fmtDateTime(lead.convertedAt, config.timeZone)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lead.clientId ? (
            <Link href={`/clients/${lead.clientId}`} className="btn btn-primary">
              Open client →
            </Link>
          ) : (
            <>
              <ConvertLeadButton leadId={lead.id} name={lead.name} />
              <DeleteLeadButton leadId={lead.id} title={lead.name} redirectTo="/leads" />
            </>
          )}
        </div>
      </div>

      {lead.clientId && (
        <p className="text-sm text-muted">
          This lead was converted, so it is kept as history. Edit the client&apos;s details on the client page.
        </p>
      )}

      <LeadEditForm lead={lead} users={users} />
    </div>
  );
}

export default function LeadPage({ params }: PageProps<"/leads/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <LeadDetail params={params} />
    </Suspense>
  );
}
