"use client";

import { Button, InputText, Select } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";
import { setHubstaffUserId } from "@/app/actions";
import { DataGrid } from "@/components/data-grid";
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

/** Everyone the viewer manages, with search and filters. Super admins can edit team, role and Hubstaff id inline. */
export function PeopleList({
  people,
  teams,
  admin,
}: {
  people: Person[];
  teams: Team[];
  admin: boolean;
}) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("all");
  const [missingId, setMissingId] = useState(false);

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const needle = q.trim().toLowerCase();
  const shown = people.filter(
    (p) =>
      (!needle ||
        p.name.toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle)) &&
      (team === "all" ||
        (team === "none" ? p.teamId === null : String(p.teamId) === team)) &&
      (!missingId || p.hubstaffUserId === null),
  );
  const missingCount = people.filter((p) => p.hubstaffUserId === null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4">
        <InputText
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          aria-label="Search people"
          className="w-64 max-w-full"
        />
        {teams.length > 1 && (
          <Select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label="Filter by team"
            className="w-48"
          >
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">No team</option>
          </Select>
        )}
        {admin && (
          <Button
            type="button"
            size="small"
            rounded
            severity="secondary"
            outlined={!missingId}
            aria-pressed={missingId}
            onClick={() => setMissingId((v) => !v)}
          >
            No Hubstaff id ({missingCount})
          </Button>
        )}
        <span className="ml-auto text-xs text-muted" aria-live="polite">
          {shown.length === people.length
            ? `${people.length} people`
            : `${shown.length} of ${people.length}`}
        </span>
      </div>

      <DataGrid
        flush
        headers={[
          "Person",
          "Team",
          ...(admin ? ["Role", "Hubstaff user id"] : []),
        ]}
        empty={
          <>
            No one matches.{" "}
            <Button
              link
              size="small"
              className="p-0"
              onClick={() => {
                setQ("");
                setTeam("all");
                setMissingId(false);
              }}
            >
              Clear filters
            </Button>
          </>
        }
        rows={shown.map((p) => ({
          key: p.id,
          cells: [
            <div key="p" className="flex items-center gap-3">
              <Avatar name={p.name} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2">
                  <Link
                    href={`/reports?user=${p.id}`}
                    className="font-medium hover:underline"
                    title="See this person's report"
                  >
                    {p.name}
                  </Link>
                  {p.isLeader && <span className="badge">Leader</span>}
                  {p.role === "super_admin" && (
                    <span className="badge">Super admin</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{p.email}</p>
              </div>
            </div>,
            admin ? (
              <TeamSelect
                key="t"
                userId={p.id}
                teamId={p.teamId}
                teams={teams}
                name={p.name}
              />
            ) : (
              <span key="t" className="text-muted">
                {teamName.get(p.teamId ?? -1) ?? "No team"}
              </span>
            ),
            ...(admin
              ? [
                  <RoleSelect
                    key="r"
                    userId={p.id}
                    role={p.role}
                    name={p.name}
                  />,
                  <form
                    key="h"
                    action={setHubstaffUserId.bind(null, p.id)}
                    className="flex items-center gap-2"
                  >
                    <InputText
                      name="hubstaffUserId"
                      defaultValue={p.hubstaffUserId ?? ""}
                      inputMode="numeric"
                      placeholder="Not set"
                      aria-label={`Hubstaff user id for ${p.name}`}
                      className={`w-28 font-mono ${p.hubstaffUserId === null ? "border-amber-500/60" : ""}`}
                    />
                    <Button severity="secondary" outlined>
                      Save
                    </Button>
                  </form>,
                ]
              : []),
          ],
        }))}
      />
    </div>
  );
}
