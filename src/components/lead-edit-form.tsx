"use client";

import { useActionState } from "react";
import { updateLead } from "@/app/actions";
import type { Lead } from "@/db/schema";

type Option = { id: number; name: string };

export function LeadEditForm({ lead, users }: { lead: Lead; users: Option[] }) {
  const [state, action, pending] = useActionState(updateLead.bind(null, lead.id), null);
  const converted = lead.clientId !== null;
  return (
    <form action={action} className="card grid gap-3 p-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input name="name" required defaultValue={lead.name} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <input name="contactName" defaultValue={lead.contactName ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" defaultValue={lead.email ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <input name="phone" defaultValue={lead.phone ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Source
        <input name="source" defaultValue={lead.source ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Est. monthly fee
        <input
          name="expectedMonthlyValue"
          inputMode="numeric"
          defaultValue={lead.expectedMonthlyValue ?? ""}
          className="input font-mono text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Owner
        <select name="ownerId" defaultValue={lead.ownerId ?? ""} className="input text-foreground">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Status
        <select
          name={converted ? undefined : "status"}
          defaultValue={lead.status === "won" ? "proposal" : lead.status}
          disabled={converted}
          className="input text-foreground"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="meeting">Meeting</option>
          <option value="proposal">Proposal sent</option>
          <option value="lost">Lost</option>
        </select>
        {/* Disabled fields are not submitted; the server ignores status for converted leads. */}
        {converted && <input type="hidden" name="status" value="proposal" />}
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Lost reason (only used when status is Lost)
        <input name="lostReason" defaultValue={lead.lostReason ?? ""} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Notes
        <textarea name="notes" rows={4} defaultValue={lead.notes ?? ""} className="input text-foreground" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</span>}
        {state && !state.ok && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
