"use client";

import { useActionState, useEffect } from "react";
import { addMember } from "@/app/actions";

/** The add-member form, shown inside a popup. Closes itself once the person is added. */
export function AddMemberForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(addMember, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <input name="name" required autoFocus className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <input name="email" type="email" required className="input text-foreground" />
        <span>They sign in with this Google account.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Hubstaff user id (optional)
        <input name="hubstaffUserId" inputMode="numeric" className="input font-mono text-foreground" />
        <span>Matches Hubstaff time to this person. You can add it later.</span>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add member"}
        </button>
      </div>
    </form>
  );
}
