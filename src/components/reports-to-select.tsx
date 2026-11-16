"use client";

import { useState, useTransition } from "react";
import { setParentTeam } from "@/app/actions";

/** Which team's leader reviews this team leader's own tasks. */
export function ReportsToSelect({
  teamId,
  value,
  teams,
}: {
  teamId: number;
  value: number | null;
  teams: { id: number; name: string; leaderName: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <select
        aria-label="Leader's tasks are reviewed by"
        className="input h-8 w-auto cursor-pointer py-0 text-sm"
        defaultValue={value ?? ""}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const res = await setParentTeam(teamId, e.target.value ? Number(e.target.value) : null);
            setError(res.ok ? null : (res.error ?? "Something went wrong"));
          })
        }
      >
        <option value="">Nobody (the leader&apos;s tasks skip review)</option>
        {teams
          .filter((t) => t.id !== teamId)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.leaderName ? ` — ${t.leaderName}` : " — no leader"}
            </option>
          ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
