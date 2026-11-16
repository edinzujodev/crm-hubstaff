"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { createLead } from "@/app/actions";

type Option = { id: number; name: string };

export function NewLeadForm({ users }: { users: Option[] }) {
  const [state, action, pending] = useActionState(createLead, null);
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={form} action={action} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
        New lead
        <InputText name="name" required placeholder="e.g. Maple Street Bakery" className="w-full text-foreground" />
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
        <InputText name="expectedMonthlyValue" inputMode="numeric" className="w-32 font-mono text-foreground" />
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
      <Button disabled={pending}>{pending ? "Adding…" : "Add lead"}</Button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
