import { DataGrid } from "@/components/data-grid";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { TeamMenu } from "@/components/team-menu";
import { NewTeamButton } from "@/components/team-popups";
import { pageGuard } from "@/lib/auth";

/** Setting teams up: who is in which team, and who leads it. Each team's tasks are on its own page. */
async function TeamsContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const [allUsers, allTeams] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
  ]);
  // A team leader sees the teams they look after.
  const teams = admin ? allTeams : allTeams.filter((t) => auth.ledTeamIds.includes(t.id));
  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));
  const options = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    teamName: u.teamId ? (teamName.get(u.teamId) ?? null) : null,
  }));

  return (
    <HrTabs auth={auth} active="teams" actions={admin ? <NewTeamButton users={options} /> : undefined}>
      <DataGrid
        flush
        empty={admin ? "No teams yet. Use “New team” to add the first one." : "You don't lead a team yet."}
        headers={["Team", "Leader", "Members", "Off at once"]}
        rows={teams.map((t) => {
          const members = allUsers.filter((u) => u.teamId === t.id);
          const leader = allUsers.find((u) => u.id === t.leaderId);
          return {
            key: t.id,
            cells: [
              <Link key="n" href={`/hr/teams/${t.id}`} className="font-medium hover:underline" title="Open this team">
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
              t.maxOff === null ? (
                <span key="o" className="text-muted">
                  No limit
                </span>
              ) : (
                <span key="o" className="tabular-nums" title={`At most ${t.maxOff} of ${members.length} people off on the same day`}>
                  {t.maxOff} / {members.length}
                </span>
              ),
            ],
            actions: (
              <TeamMenu
                teamId={t.id}
                name={t.name}
                canManage={admin}
                team={{ id: t.id, name: t.name, leaderId: t.leaderId, memberIds: members.map((m) => m.id) }}
                users={options}
              />
            ),
          };
        })}
      />
    </HrTabs>
  );
}

export default function TeamsPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Teams</h1>
      <HrSuspense actions={(a) => (a.role === "super_admin" ? ["+ New team"] : undefined)}>
        <TeamsContent />
      </HrSuspense>
    </div>
  );
}
