"use client";

import { useTransition } from "react";
import { setTeamLeader } from "@/app/actions";

/** Picks a team's leader. Choosing someone also puts them in the team. */
export function TeamLeaderSelect({
  teamId,
  leaderId,
  users,
  teamName,
}: {
  teamId: number;
  leaderId: number | null;
  users: { id: number; name: string }[];
  teamName: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label={`Leader of ${teamName}`}
      className="input py-1"
      value={leaderId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await setTeamLeader(teamId, e.target.value ? Number(e.target.value) : null);
          if (!res.ok) alert(res.error);
        })
      }
    >
      <option value="">No leader</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
