"use client";

import { useActionState, useEffect } from "react";
import { createTeam } from "@/app/actions";

/** The new-team form, shown inside a popup. Closes itself once the team is created. */
export function NewTeamForm({
  users,
  onDone,
  onCancel,
}: {
  users: { id: number; name: string }[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(createTeam, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team name
        <input name="name" required autoFocus placeholder="e.g. Payroll team" className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team leader (optional)
        <select name="leaderId" className="input text-foreground" defaultValue="">
          <option value="">No leader yet</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span>The leader is added to the team and sees its tasks and reports.</span>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add team"}
        </button>
      </div>
    </form>
  );
}
