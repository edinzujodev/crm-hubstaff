"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTeam } from "@/app/actions";

export function NewTeamForm({ users }: { users: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(createTeam, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
        New team
        <input name="name" required placeholder="e.g. Payroll team" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team leader
        <select name="leaderId" className="input text-foreground" defaultValue="">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add team"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
