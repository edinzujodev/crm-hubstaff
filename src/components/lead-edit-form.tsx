"use client";

import { Button, InputText, InputTextarea, Select } from "@/components/ui";
import { useActionState, useEffect } from "react";
import { updateLead } from "@/app/actions";
import type { Lead } from "@/db/schema";

type Option = { id: number; name: string };

/** Pass `onDone` to use it inside a popup: no card frame, a Cancel button, and it closes after saving. */
export function LeadEditForm({ lead, users, onDone }: { lead: Lead; users: Option[]; onDone?: () => void }) {
  const [state, action, pending] = useActionState(updateLead.bind(null, lead.id), null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);
  const converted = lead.clientId !== null;
  return (
    <form action={action} className={`grid gap-3 sm:grid-cols-2 ${onDone ? "" : "card p-4"}`}>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <InputText name="name" required defaultValue={lead.name} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <InputText name="contactName" defaultValue={lead.contactName ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <InputText name="email" type="email" defaultValue={lead.email ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <InputText name="phone" defaultValue={lead.phone ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Source
        <InputText name="source" defaultValue={lead.source ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Est. monthly fee
        <InputText
          name="expectedMonthlyValue"
          inputMode="numeric"
          defaultValue={lead.expectedMonthlyValue ?? ""}
          className="w-full font-mono text-foreground"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Owner
        <Select name="ownerId" defaultValue={lead.ownerId ?? ""} className="w-full text-foreground">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Status
        <Select
          name={converted ? undefined : "status"}
          defaultValue={lead.status === "won" ? "proposal" : lead.status}
          disabled={converted}
          className="w-full text-foreground"
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="meeting">Meeting</option>
          <option value="proposal">Proposal sent</option>
          <option value="lost">Lost</option>
        </Select>
        {/* Disabled fields are not submitted; the server ignores status for converted leads. */}
        {converted && <input type="hidden" name="status" value="proposal" />}
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Lost reason (only used when status is Lost)
        <InputText name="lostReason" defaultValue={lead.lostReason ?? ""} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Notes
        <InputTextarea autoResize={false} style={{ width: "100%" }} name="notes" rows={4} defaultValue={lead.notes ?? ""} className="text-foreground" />
      </label>
      <div className={`flex items-center gap-3 sm:col-span-2 ${onDone ? "justify-end" : ""}`}>
        {onDone && (
          <Button type="button"  severity="secondary" outlined onClick={onDone}>
            Cancel
          </Button>
        )}
        <Button  disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {!onDone && state?.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</span>}
        {state && !state.ok && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
