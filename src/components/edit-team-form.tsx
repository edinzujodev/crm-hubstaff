"use client";

import { Button, InputText, Select } from "@/components/ui";
import { useActionState, useEffect } from "react";
import { updateTeam } from "@/app/actions";
import { MemberPicker, type PickerUser } from "@/components/member-picker";

export type TeamEditData = { id: number; name: string; leaderId: number | null; memberIds: number[]; maxOff: number | null };

/** Rename a team, change its leader and add or remove its members. */
export function EditTeamForm({ team, users, onDone }: { team: TeamEditData; users: PickerUser[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateTeam.bind(null, team.id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team name
        <InputText name="name" required autoFocus defaultValue={team.name} className="w-full text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team lead
        <Select name="leaderId" className="w-full text-foreground" defaultValue={team.leaderId ?? ""}>
          <option value="">No team lead</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <span>The team lead is always a member of the team.</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Most people off at the same time
        <InputText name="maxOff" type="number" min={1} step={1} inputMode="numeric" defaultValue={team.maxOff ?? ""} placeholder="No limit" className="w-full text-foreground" />
        <span>Time-off requests that would put more of the team off on one day are refused. Sick leave is never refused, but it counts toward the limit. Leave empty for no limit.</span>
      </label>
      <MemberPicker users={users} selected={team.memberIds} />
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" severity="secondary" outlined onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
