"use client";

import { Button, InputText } from "@/components/ui";
import { useActionState, useEffect } from "react";
import { addMember } from "@/app/actions";

/** The add-member form. In a popup it closes itself once the person is added; on its own (first sign-in) it stays. */
export function AddMemberForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const [state, action, pending] = useActionState(addMember, null);
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Name
        <InputText name="name" required autoFocus className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Email
        <InputText name="email" type="email" required className="w-full text-foreground" />
        <span>They sign in with this Google account.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Hubstaff user id (optional)
        <InputText name="hubstaffUserId" inputMode="numeric" className="w-full font-mono text-foreground" />
        <span>Matches Hubstaff time to this person. You can add it later.</span>
      </label>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" severity="secondary" outlined onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
