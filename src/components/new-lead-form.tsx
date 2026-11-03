"use client";

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
        <input name="name" required placeholder="e.g. Maple Street Bakery" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Contact
        <input name="contactName" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Phone
        <input name="phone" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Source
        <input name="source" placeholder="referral, website…" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Est. monthly fee
        <input name="expectedMonthlyValue" inputMode="numeric" className="input w-32 font-mono text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Owner
        <select name="ownerId" className="input text-foreground" defaultValue="">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add lead"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
