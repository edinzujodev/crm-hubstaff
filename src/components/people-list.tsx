"use client";

import Link from "next/link";
import { useState } from "react";
import { setHubstaffUserId } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { RoleSelect } from "@/components/role-select";
import { TeamSelect } from "@/components/team-select";

export type Person = {
  id: number;
  name: string;
  email: string;
  teamId: number | null;
  role: "super_admin" | "member";
  hubstaffUserId: number | null;
  isLeader: boolean;
};

type Team = { id: number; name: string };

const chip = (on: boolean) =>
  `cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors ${
    on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted hover:bg-primary/5 hover:text-foreground"
  }`;

/** Everyone the viewer manages, with search and filters. Super admins can edit team, role and Hubstaff id inline. */
export function PeopleList({ people, teams, admin }: { people: Person[]; teams: Team[]; admin: boolean }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [missingId, setMissingId] = useState(false);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const needle = q.trim().toLowerCase();
  const shown = people.filter(
    (p) =>
      (!needle || p.name.toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle)) &&
      (team === "all" || (team === "none" ? p.teamId === null : String(p.teamId) === team)) &&
      (!missingId || p.hubstaffUserId === null),
  );
  const missingCount = people.filter((p) => p.hubstaffUserId === null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search people"
          className="input w-64 max-w-full"
        />
        {teams.length > 1 && (
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filter by team" className="input">
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">No team</option>
          </select>
        )}
        {admin && (
          <button type="button" className={chip(missingId)} aria-pressed={missingId} onClick={() => setMissingId((v) => !v)}>
            No Hubstaff id ({missingCount})
          </button>
        )}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {shown.length === people.length ? `${people.length} people` : `${shown.length} of ${people.length}`}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Team</th>
              {admin && <th className="px-3 py-2 font-medium">Role</th>}
              {admin && <th className="px-3 py-2 font-medium">Hubstaff user id</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id} className="border-b border-border transition-colors last:border-0 hover:bg-primary/5">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <Link href={`/reports?user=${p.id}`} className="font-medium hover:underline" title="See this person's report">
                          {p.name}
                        </Link>
                        {p.isLeader && <span className="badge">Leader</span>}
                        {p.role === "super_admin" && <span className="badge">Super admin</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{p.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {admin ? (
                    <TeamSelect userId={p.id} teamId={p.teamId} teams={teams} name={p.name} />
                  ) : (
                    <span className="text-muted">{teamName.get(p.teamId ?? -1) ?? "No team"}</span>
                  )}
                </td>
                {admin && (
                  <td className="px-3 py-2">
                    <RoleSelect userId={p.id} role={p.role} name={p.name} />
                  </td>
                )}
                {admin && (
                  <td className="px-3 py-2">
                    <form action={setHubstaffUserId.bind(null, p.id)} className="flex items-center gap-2">
                      <input
                        name="hubstaffUserId"
                        defaultValue={p.hubstaffUserId ?? ""}
                        inputMode="numeric"
                        placeholder="Not set"
                        aria-label={`Hubstaff user id for ${p.name}`}
                        className={`input w-28 font-mono ${p.hubstaffUserId === null ? "border-amber-500/60" : ""}`}
                      />
                      <button className="btn cursor-pointer">Save</button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={admin ? 4 : 2} className="px-3 py-8 text-center text-muted">
                  No one matches.{" "}
                  <button
                    className="cursor-pointer underline"
                    onClick={() => {
                      setQ("");
                      setTeam("all");
                      setMissingId(false);
                    }}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
