"use client";

import { useState, useTransition } from "react";
import { setUserTeam } from "@/app/actions";
import { Avatar } from "@/components/avatar";

type Member = { id: number; name: string; email: string; isLeader: boolean };

/** A team's members, with a Remove button each (super admin only). Adding is done in Edit team. */
export function TeamMembers({ members, canEdit }: { members: Member[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = (id: number) =>
    start(async () => {
      const res = await setUserTeam(id, null);
      setError(res.ok ? null : res.error);
    });

  if (members.length === 0) return <p className="text-sm text-muted">No members yet. Use “Edit team” to add people.</p>;
  return (
    <div>
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <Avatar name={m.name} size="sm" />
            <span className="flex-1">
              <span className="text-sm font-medium">{m.name}</span>
              {m.isLeader && <span className="ml-2 text-xs text-muted">Leader</span>}
              <span className="block text-xs text-muted">{m.email}</span>
            </span>
            {canEdit && (
              <button type="button" className="btn cursor-pointer" disabled={pending} onClick={() => remove(m.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
