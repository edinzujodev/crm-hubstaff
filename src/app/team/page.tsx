import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { setHubstaffUserId } from "@/app/actions";
import { AddMemberForm } from "@/components/add-member-form";
import { DeleteTeamButton } from "@/components/delete-team-button";
import { NewTeamForm } from "@/components/new-team-form";
import { TeamLeaderSelect } from "@/components/team-leader-select";
import { TeamSelect } from "@/components/team-select";

async function Teams() {
  await connection();
  const [teams, users] = await Promise.all([
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
  ]);
  const options = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="space-y-4">
      <NewTeamForm users={options} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Team</th>
              <th className="px-3 py-2 font-medium">Leader</th>
              <th className="px-3 py-2 font-medium">Members</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const members = users.filter((u) => u.teamId === t.id);
              return (
                <tr key={t.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2">
                    <TeamLeaderSelect teamId={t.id} leaderId={t.leaderId} users={options} teamName={t.name} />
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {members.length ? members.map((m) => m.name).join(", ") : "No members yet. Pick a team for someone below."}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/reports?team=${t.id}`} className="btn py-1">
                        Team report →
                      </Link>
                      <DeleteTeamButton teamId={t.id} title={t.name} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {teams.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted">
                  No teams yet. Add the first one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function Members() {
  await connection();
  const [users, teams] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
  ]);
  const leaderIds = new Set(teams.map((t) => t.leaderId).filter((id) => id !== null));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Team</th>
            <th className="px-3 py-2 font-medium">Hubstaff user id</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2">
                <Link href={`/reports?user=${u.id}`} className="hover:underline">
                  {u.name}
                </Link>
                {leaderIds.has(u.id) && <span className="badge ml-2">Leader</span>}
              </td>
              <td className="px-3 py-2 text-muted">{u.email}</td>
              <td className="px-3 py-2">
                <TeamSelect userId={u.id} teamId={u.teamId} teams={teamOptions} name={u.name} />
              </td>
              <td className="px-3 py-2">
                <form action={setHubstaffUserId.bind(null, u.id)} className="flex gap-2">
                  <input
                    name="hubstaffUserId"
                    defaultValue={u.hubstaffUserId ?? ""}
                    inputMode="numeric"
                    aria-label={`Hubstaff user id for ${u.name}`}
                    className="input w-32 font-mono"
                  />
                  <button className="btn">Save</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Team</h1>

      <section className="space-y-2">
        <h2 className="font-semibold">Teams</h2>
        <p className="max-w-2xl text-sm text-muted">
          Each person is in one team, so team totals never count the same hours twice. A team&apos;s leader is also a
          member of it. Reports can be filtered and grouped by team.
        </p>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Teams />
        </Suspense>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">People</h2>
        <p className="max-w-2xl text-sm text-muted">
          Hubstaff time is matched to people by their Hubstaff user id. Without it, Start can&apos;t assign the Hubstaff
          task to them and their hours show as unmatched.
        </p>
        <AddMemberForm />
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Members />
        </Suspense>
      </section>
    </div>
  );
}
