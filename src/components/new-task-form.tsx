"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTask } from "@/app/actions";

type Option = { id: number; name: string };

export function NewTaskForm({ clients, users }: { clients: Option[]; users: Option[] }) {
  const [state, action, pending] = useActionState(createTask, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="card flex flex-wrap items-end gap-2 p-3">
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted">
        New task
        <input name="title" required placeholder="e.g. Monthly bank reconciliation" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Client
        <select name="clientId" required className="input text-foreground" defaultValue="">
          <option value="" disabled>
            Select…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Assignee
        <select name="assigneeId" className="input text-foreground" defaultValue="">
          <option value="">—</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due
        <input type="date" name="dueDate" className="input text-foreground" />
      </label>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add task"}
      </button>
      {state && !state.ok && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
