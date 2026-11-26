"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createClient } from "@/app/actions";
import { Modal } from "@/components/modal";

/** The "+ New client" button, which opens the form in a popup. */
export function NewClientForm() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <Button type="button" onClick={() => setOpen(true)}>
        + New client
      </Button>
      {open && (
        <Modal title="New client" wide onClose={() => setOpen(false)}>
          <ClientForm onDone={() => setOpen(false)} />
        </Modal>
      )}
    </div>
  );
}

function ClientForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(createClient, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      onDone();
      router.push(`/clients/${state.data.id}`);
    }
  }, [state, router, onDone]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Name
        <InputText name="name" required autoFocus placeholder="e.g. Acme LLC" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="kind" defaultValue="company" className="w-full text-foreground">
          <option value="company">Single company</option>
          <option value="group">Group of companies</option>
        </Select>
      </label>
      <label
        className="flex flex-col gap-1 text-xs text-muted"
        title="Optional. Overrides HUBSTAFF_PROJECT_ID for this client's tasks."
      >
        Hubstaff project id
        <InputText name="hubstaffProjectId" inputMode="numeric" className="w-full font-mono text-foreground" />
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
        Notes
        <InputText name="notes" className="w-full text-foreground" />
      </label>
      {state && !state.ok && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
