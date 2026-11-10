import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { DeleteTeamButton } from "@/components/delete-team-button";
import { PeopleList, type Person } from "@/components/people-list";
import { AddMemberButton, NewTeamButton } from "@/components/team-popups";
import { pageGuard } from "@/lib/auth";

function Tile({ label, value, tone, hint }: { label: string; value: number; tone?: "warn"; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}

function SectionHead({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="max-w-2xl text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Setting teams up: who is in which team, who leads it, and its urgency levels. Tasks live on each team's own page. */
async function TeamContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const [allUsers, allTeams] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
  ]);
  // A team leader only sees their own team.
  const teams = admin ? allTeams : allTeams.filter((t) => t.id === auth.ledTeam?.id);
  const users = admin ? allUsers : allUsers.filter((u) => u.teamId === auth.ledTeam?.id);
  const leaderIds = new Set(allTeams.map((t) => t.leaderId).filter((id) => id !== null));
  const options = allUsers.map((u) => ({ id: u.id, name: u.name }));
  const teamOptions = allTeams.map((t) => ({ id: t.id, name: t.name }));

  const people: Person[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    teamId: u.teamId,
    role: u.role,
    hubstaffUserId: u.hubstaffUserId,
    isLeader: leaderIds.has(u.id),
  }));
  const missingIds = people.filter((p) => p.hubstaffUserId === null).length;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-3">
        <Tile label="People" value={people.length} />
        <Tile label={admin ? "Teams" : "Your team"} value={teams.length} />
        {admin && (
          <Tile
            label="No Hubstaff id"
            value={missingIds}
            tone={missingIds ? "warn" : undefined}
            hint="Their Hubstaff time can't be matched to them until it is set"
          />
        )}
      </section>

      <section className="space-y-3">
        <SectionHead
          title={admin ? "Teams" : "Your team"}
          action={admin ? <NewTeamButton users={options} /> : undefined}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => {
            const members = allUsers.filter((u) => u.teamId === t.id);
            const leader = allUsers.find((u) => u.id === t.leaderId);
            return (
              <section key={t.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">
                      <Link href={`/team/${t.id}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-muted">
                      {members.length} {members.length === 1 ? "member" : "members"} · Leader: {leader?.name ?? "none yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/team/${t.id}`} className="btn py-1">
                      Tasks &amp; details →
                    </Link>
                    {admin && <DeleteTeamButton teamId={t.id} title={t.name} />}
                  </div>
                </header>

                {members.length ? (
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
                    {members.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-2">
                        <Avatar name={m.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                        {m.id === t.leaderId && <span className="badge">Leader</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-border px-4 py-5 text-sm text-muted">
                    No members yet.{admin ? " Pick this team for someone in the People list below." : ""}
                  </p>
                )}

              </section>
            );
          })}
          {teams.length === 0 && (
            <p className="card p-6 text-center text-muted lg:col-span-2">
              {admin ? "No teams yet. Use “New team” to add the first one." : "You don't lead a team yet."}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHead
          title="People"
          action={admin ? <AddMemberButton /> : undefined}
        />
        <PeopleList people={people} teams={teamOptions} admin={admin} />
      </section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Team</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <TeamContent />
      </Suspense>
    </div>
  );
}
