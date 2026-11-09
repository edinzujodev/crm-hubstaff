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
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="flex flex-col gap-1.5">
          <span className="badge w-fit border-amber-500/60 text-amber-700 dark:text-amber-400">Approaching</span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">under</span>
            <input
              name="approachingHours"
              type="number"
              min={1}
              defaultValue={approachingHours}
              className="input w-20 text-center"
              aria-label="Approaching: hours before the due date"
            />
            <span className="text-muted">hours</span>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="badge w-fit border-red-500/60 text-red-700 dark:text-red-400">Critical</span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">under</span>
            <input
              name="criticalHours"
              type="number"
              min={1}
              defaultValue={criticalHours}
              className="input w-20 text-center"
              aria-label="Critical: hours before the due date"
            />
            <span className="text-muted">hours</span>
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          {state?.ok && <span className="text-sm text-emerald-700 dark:text-emerald-400">✓ Saved</span>}
        </div>
      </div>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
