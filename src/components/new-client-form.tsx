"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { createClient } from "@/app/actions";

export function NewClientForm() {
  const [state, action, pending] = useActionState(createClient, null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      router.push(`/clients/${state.data.id}`);
    }
  }, [state, router]);

  return (
    <form ref={form} action={action} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
        New client
        <InputText name="name" required placeholder="e.g. Acme LLC" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Type
        <Select name="kind" defaultValue="company" className="w-full text-foreground">
          <option value="company">Single company</option>
          <option value="group">Group of companies</option>
        </Select>
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
      <label className="flex flex-col gap-1 text-xs text-muted" title="Optional. Overrides HUBSTAFF_PROJECT_ID for this client's tasks.">
        Hubstaff project id
        <InputText name="hubstaffProjectId" inputMode="numeric" className="w-36 font-mono text-foreground" />
      </label>
      <label className="flex w-full flex-col gap-1 text-xs text-muted">
        Notes
        <InputText name="notes" className="w-full text-foreground" />
      </label>
      <Button  disabled={pending}>
        {pending ? "Adding…" : "Add client"}
      </Button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
