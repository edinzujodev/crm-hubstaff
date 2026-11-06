"use client";

import { useActionState } from "react";
import { setTeamLevels } from "@/app/actions";

/** The two urgency levels of a team, in hours until the due date. Saved by the team leader. */
export function TeamLevelsForm({
  teamId,
  approachingHours,
  criticalHours,
}: {
  teamId: number;
  approachingHours: number;
  criticalHours: number;
}) {
  const [state, action, pending] = useActionState(setTeamLevels.bind(null, teamId), null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <label className="flex items-center gap-1">
        <span className="badge border-amber-500/60 text-amber-700 dark:text-amber-400">Approaching</span>
        under
        <input
          name="approachingHours"
          type="number"
          min={1}
          defaultValue={approachingHours}
          className="input w-16 py-1 text-center"
          aria-label="Approaching: hours before the due date"
        />
        h
      </label>
      <label className="flex items-center gap-1">
        <span className="badge border-red-500/60 text-red-700 dark:text-red-400">Critical</span>
        under
        <input
          name="criticalHours"
          type="number"
          min={1}
          defaultValue={criticalHours}
          className="input w-16 py-1 text-center"
          aria-label="Critical: hours before the due date"
        />
        h
      </label>
      <button className="btn py-1" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.ok && <span className="text-emerald-700 dark:text-emerald-400">Saved</span>}
      {state && !state.ok && <span className="w-full text-red-600">{state.error}</span>}
    </form>
  );
}
