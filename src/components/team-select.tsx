"use client";

import { useTransition } from "react";
import { setUserTeam } from "@/app/actions";

/** Which team a person is in. */
export function TeamSelect({
  userId,
  teamId,
  teams,
  name,
}: {
  userId: number;
  teamId: number | null;
  teams: { id: number; name: string }[];
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={`Team for ${name}`}
      className="input py-1"
      value={teamId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await setUserTeam(userId, e.target.value ? Number(e.target.value) : null);
          if (!res.ok) alert(res.error);
        })
      }
    >
      <option value="">No team</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
