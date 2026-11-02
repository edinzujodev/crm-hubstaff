"use client";

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
        <input name="name" required placeholder="e.g. Acme LLC" className="input text-foreground" />
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
      <label className="flex flex-col gap-1 text-xs text-muted" title="Optional. Overrides HUBSTAFF_PROJECT_ID for this client's tasks.">
        Hubstaff project id
        <input name="hubstaffProjectId" inputMode="numeric" className="input w-36 font-mono text-foreground" />
      </label>
      <label className="flex w-full flex-col gap-1 text-xs text-muted">
        Notes
        <input name="notes" className="input text-foreground" />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add client"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
