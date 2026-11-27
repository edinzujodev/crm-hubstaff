import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { HrSuspense, HrTabs } from "@/components/hr-tabs";
import { PeopleList, type Person } from "@/components/people-list";
import { AddMemberButton } from "@/components/team-popups";
import { pageGuard } from "@/lib/auth";

function Tile({ label, value, tone, hint }: { label: string; value: number; tone?: "warn"; hint?: string }) {
  return (
    <div className="px-4 py-3" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xl tabular-nums ${tone === "warn" ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</p>
    </div>
  );
}

/** Everyone in the company (a team leader: their team), with their team, role and Hubstaff id. */
async function PeopleContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const [allUsers, allTeams] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
  ]);
  const users = admin ? allUsers : allUsers.filter((u) => u.teamId !== null && auth.ledTeamIds.includes(u.teamId));
  const leaderIds = new Set(allTeams.map((t) => t.leaderId).filter((id) => id !== null));
  const teamOptions = allTeams.map((t) => ({ id: t.id, name: t.name }));

  const people: Person[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    teamId: u.teamId,
    role: u.role,
    hubstaffUserId: u.hubstaffUserId,
    isLeader: leaderIds.has(u.id),
    jobTitle: u.jobTitle,
    startedOn: u.startedOn,
    twoFactor: !!u.totpEnabledAt,
  }));
  const missingIds = people.filter((p) => p.hubstaffUserId === null).length;

  return (
    <HrTabs auth={auth} active="people" actions={admin ? <AddMemberButton /> : undefined}>
      <section className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <Tile label="People" value={people.length} />
        <Tile label={admin ? "Teams" : "Teams you lead"} value={admin ? allTeams.length : auth.ledTeamIds.length} />
        {admin && (
          <Tile
            label="No Hubstaff id"
            value={missingIds}
            tone={missingIds ? "warn" : undefined}
            hint="Their Hubstaff time can't be matched to them until it is set"
          />
        )}
      </section>
      <PeopleList people={people} teams={teamOptions} admin={admin} />
    </HrTabs>
  );
}

export default function PeoplePage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">People</h1>
      <HrSuspense actions={(a) => (a.role === "super_admin" ? ["+ Add member"] : undefined)}>
        <PeopleContent />
      </HrSuspense>
    </div>
  );
}
