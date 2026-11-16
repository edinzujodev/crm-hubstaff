import { DataGrid } from "@/components/data-grid";
import { LinkTabs } from "@/components/link-tabs";
import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { TeamMenu } from "@/components/team-menu";
import { PeopleList, type Person } from "@/components/people-list";
import { AddMemberButton, NewTeamButton } from "@/components/team-popups";
import { pageGuard } from "@/lib/auth";

function Tile({ label, value, tone, hint }: { label: string; value: number; tone?: "warn"; hint?: string }) {
  return (
    <div className="card p-4" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-2xl tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}
      >
        {value}
      </p>
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
async function TeamContent({ show }: { show?: string }) {
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
  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));
  const options = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    teamName: u.teamId ? (teamName.get(u.teamId) ?? null) : null,
  }));
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

      <LinkTabs
        tabs={[
          { label: "People", href: "/team", count: people.length },
          { label: admin ? "Teams" : "Your team", href: "/team?show=teams", count: teams.length },
        ]}
        active={show === "teams" ? 1 : 0}
      />

      {show !== "teams" && (
        <section className="space-y-3">
          <SectionHead title="People" action={admin ? <AddMemberButton /> : undefined} />
          <PeopleList people={people} teams={teamOptions} admin={admin} />
        </section>
      )}

      {show === "teams" && (
        <section className="space-y-3">
          <SectionHead
            title={admin ? "Teams" : "Your team"}
            action={admin ? <NewTeamButton users={options} /> : undefined}
          />
          <DataGrid
            empty={admin ? "No teams yet. Use “New team” to add the first one." : "You don't lead a team yet."}
            headers={["Team", "Leader", "Members"]}
            rows={teams.map((t) => {
              const members = allUsers.filter((u) => u.teamId === t.id);
              const leader = allUsers.find((u) => u.id === t.leaderId);
              return {
                key: t.id,
                cells: [
                  <Link key="n" href={`/team/${t.id}`} className="font-medium hover:underline" title="Open this team">
                    {t.name}
                  </Link>,
                  leader ? (
                    <span key="l" className="flex items-center gap-2">
                      <Avatar name={leader.name} size="sm" />
                      {leader.name}
                    </span>
                  ) : (
                    <span key="l" className="text-muted">
                      None yet
                    </span>
                  ),
                  members.length ? (
                    <span key="m" className="flex items-center gap-2">
                      <span className="flex -space-x-2">
                        {members.slice(0, 4).map((m) => (
                          <span key={m.id} title={m.name} className="rounded-full ring-2 ring-surface">
                            <Avatar name={m.name} size="sm" />
                          </span>
                        ))}
                      </span>
                      <span className="text-muted">
                        {members.length} {members.length === 1 ? "member" : "members"}
                      </span>
                    </span>
                  ) : (
                    <span key="m" className="text-muted">
                      No members yet
                    </span>
                  ),
                ],
                actions: (
                  <>
                    <Link
                      href={`/team/${t.id}`}
                      className="p-button p-button-icon-only p-button-outlined p-button-secondary"
                      title="Team details and tasks"
                      aria-label={`Details for ${t.name}`}
                    >
                      <i aria-hidden className="pi pi-arrow-up-right" />
                    </Link>
                    {admin && (
                      <TeamMenu
                        teamId={t.id}
                        name={t.name}
                        team={{ id: t.id, name: t.name, leaderId: t.leaderId, memberIds: members.map((m) => m.id) }}
                        users={options}
                      />
                    )}
                  </>
                ),
              };
            })}
          />
        </section>
      )}
    </div>
  );
}

async function TeamLoader({ show }: { show: Promise<string | undefined> }) {
  return <TeamContent show={await show} />;
}

export default function TeamPage({ searchParams }: PageProps<"/team">) {
  const show = searchParams.then((p) => (typeof p.show === "string" ? p.show : undefined));
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Teams & people</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <TeamLoader show={show} />
      </Suspense>
    </div>
  );
}
