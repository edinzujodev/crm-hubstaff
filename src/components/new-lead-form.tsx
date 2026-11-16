"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createLead } from "@/app/actions";
import { Modal } from "@/components/modal";

type Option = { id: number; name: string };

/** The "+ New lead" button, which opens the form in a popup. */
export function NewLeadForm({ users }: { users: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button type="button" onClick={() => setOpen(true)}>
        + New lead
      </Button>
      {open && (
        <Modal title="New lead" wide onClose={() => setOpen(false)}>
          <LeadForm users={users} onDone={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function LeadForm({ users, onDone }: { users: Option[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(createLead, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      onDone();
      router.refresh();
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Name
        <InputText name="name" required autoFocus placeholder="e.g. Maple Street Bakery" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <InputText name="contactName" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <InputText name="email" type="email" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <InputText name="phone" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Source
        <InputText name="source" placeholder="referral, website…" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Est. monthly fee
        <InputText name="expectedMonthlyValue" inputMode="numeric" className="w-full font-mono text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Owner
        <Select name="ownerId" className="w-full text-foreground" defaultValue="">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Adding…" : "Add lead"}</Button>
      </div>
    </form>
  );
}
