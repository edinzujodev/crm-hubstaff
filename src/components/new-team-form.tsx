"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useActionState, useEffect } from "react";
import { createTeam } from "@/app/actions";
import { MemberPicker, type PickerUser } from "@/components/member-picker";

/** The new-team form, shown inside a popup. Closes itself once the team is created. */
export function NewTeamForm({
  users,
  onDone,
  onCancel,
}: {
  users: PickerUser[];
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
        <InputText name="name" required autoFocus placeholder="e.g. Payroll team" className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team lead (optional)
        <Select name="leaderId" className="w-full text-foreground" defaultValue="">
          <option value="">No team lead yet</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <span>The team lead is added to the team and sees its tasks and reports.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Most people off at the same time
        <InputText name="maxOff" type="number" min={1} step={1} inputMode="numeric" placeholder="No limit" className="w-full text-foreground" />
        <span>Time-off requests that would put more of the team off on one day are refused. Sick leave is never refused, but it counts toward the limit. Leave empty for no limit.</span>
      </label>
      <MemberPicker users={users} />
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" severity="secondary" outlined onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
