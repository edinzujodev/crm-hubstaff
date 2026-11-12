"use client";

import { useActionState, useEffect } from "react";
import { updateTeam } from "@/app/actions";
import { MemberPicker, type PickerUser } from "@/components/member-picker";

export type TeamEditData = { id: number; name: string; leaderId: number | null; memberIds: number[] };

/** Rename a team, change its leader and add or remove its members. */
export function EditTeamForm({
  team,
  users,
  onDone,
}: {
  team: TeamEditData;
  users: PickerUser[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateTeam.bind(null, team.id), null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team name
        <input name="name" required autoFocus defaultValue={team.name} className="input text-foreground" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Team leader
        <select name="leaderId" className="input text-foreground" defaultValue={team.leaderId ?? ""}>
          <option value="">No leader</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <span>The leader is always a member of the team.</span>
      </label>
      <MemberPicker users={users} selected={team.memberIds} />
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
