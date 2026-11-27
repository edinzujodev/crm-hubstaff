"use client";

import { Button, InputText, Select } from "@/components/ui";
import Link from "next/link";
import { useState } from "react";
import { resetTwoFactor } from "@/app/actions";
import { notify } from "@/lib/toast";
import { DataGrid } from "@/components/data-grid";
import { Avatar } from "@/components/avatar";
import { useConfirm } from "@/components/confirm-modal";
import { EditPersonButton } from "@/components/edit-person-button";

export type Person = {
  id: number;
  name: string;
  email: string;
  teamId: number | null;
  role: "super_admin" | "member";
  hubstaffUserId: number | null;
  isLeader: boolean;
  jobTitle: string | null;
  startedOn: string | null;
  /** Two-step verification (authenticator app) is set up. */
  twoFactor: boolean;
};

/** Two-step status, with a reset for a lost phone: they set up the app again at their next sign-in. */
function TwoFactorCell({ person }: { person: Person }) {
  const [pending, setPending] = useState(false);
  const [ask, confirmModal] = useConfirm();
  if (!person.twoFactor) return <span className="text-xs text-muted">Not set up</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <i className="pi pi-shield text-xs" aria-hidden /> On
      </span>
      <Button
        type="button"
        size="small"
        severity="secondary"
        text
        disabled={pending}
        title="For a lost or new phone: signs them out; they set up the app again at their next sign-in"
        onClick={async () => {
          const sure = await ask({
            title: `Reset two-step verification for ${person.name}?`,
            message: "They are signed out and set up their authenticator app again at their next sign-in.",
            confirmLabel: "Reset",
          });
          if (!sure) return;
          setPending(true);
          const r = await resetTwoFactor(person.id);
          setPending(false);
          notify(r.ok ? { message: `Two-step verification reset for ${person.name}` } : { message: "Couldn't reset it", detail: r.error, tone: "error" });
        }}
      >
        Reset
      </Button>
      {confirmModal}
    </span>
  );
}

type Team = { id: number; name: string };

/** Everyone the viewer manages, with search and filters. The pencil edits a person in a popup: a super admin everything, a team lead the details of their team's people. */
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
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
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
          ...(admin ? ["Role", "Hubstaff user id", "Two-step"] : []),
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
              <Avatar name={p.name} userId={p.id} />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2">
                  <Link
                    href={`/reports?user=${p.id}`}
                    className="font-medium hover:underline"
                    title="See this person's report"
                  >
                    {p.name}
                  </Link>
                  {p.isLeader && <span className="badge">Team lead</span>}
                  {p.role === "super_admin" && (
                    <span className="badge">Super admin</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">{p.email}</p>
              </div>
            </div>,
            <span key="t" className={p.teamId === null ? "text-muted" : ""}>
              {teamName.get(p.teamId ?? -1) ?? "No team"}
            </span>,
            ...(admin
              ? [
                  <span key="r">{p.role === "super_admin" ? "Super admin" : "Staff"}</span>,
                  p.hubstaffUserId === null ? (
                    <span key="h" className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Not set
                    </span>
                  ) : (
                    <span key="h" className="font-mono tabular-nums">
                      {p.hubstaffUserId}
                    </span>
                  ),
                  <TwoFactorCell key="2fa" person={p} />,
                ]
              : []),
          ],
          actions: <EditPersonButton person={p} teams={teams} full={admin} />,
        }))}
      />
    </div>
  );
}
