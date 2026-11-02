"use client";

import { useActionState, useEffect, useRef } from "react";
import { addMember } from "@/app/actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input name="name" required className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" required className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Hubstaff user id
        <input name="hubstaffUserId" inputMode="numeric" className="input w-32 font-mono text-foreground" />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        Add member
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
