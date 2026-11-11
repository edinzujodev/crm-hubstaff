"use client";

import { useState, useTransition } from "react";
import { setTeamLeader } from "@/app/actions";

type Person = { id: number; name: string; teamId: number | null };

/** Picks a team's leader. Choosing someone from another team also moves them into this one. */
export function TeamLeaderSelect({
  teamId,
  leaderId,
  users,
  teamName,
}: {
  teamId: number;
  leaderId: number | null;
  users: Person[];
  teamName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const members = users.filter((u) => u.teamId === teamId);
  const others = users.filter((u) => u.teamId !== teamId);

  return (
    <div className="space-y-1.5">
      <select
        aria-label={`Leader of ${teamName}`}
        className="input w-full max-w-64"
        value={leaderId ?? ""}
        disabled={pending}
        onChange={(e) => {
          setSaved(false);
          setError(null);
          startTransition(async () => {
            const res = await setTeamLeader(teamId, e.target.value ? Number(e.target.value) : null);
            if (res.ok) setSaved(true);
            else setError(res.error);
          });
        }}
      >
        <option value="">No leader</option>
        {members.length > 0 && (
          <optgroup label="In this team">
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Other people (moved into this team)">
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="min-h-4 text-xs" aria-live="polite">
        {pending ? (
          <span className="text-muted">Saving…</span>
        ) : error ? (
          <span className="text-red-600">{error}</span>
        ) : saved ? (
          <span className="text-emerald-700 dark:text-emerald-400">✓ Saved</span>
        ) : null}
      </p>
    </div>
  );
}
