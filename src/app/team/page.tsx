import Link from "next/link";
import { Suspense } from "react";
import { and, asc, isNull, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { setHubstaffUserId } from "@/app/actions";
import { AddMemberForm } from "@/components/add-member-form";
import { DeleteTeamButton } from "@/components/delete-team-button";
import { NewTeamForm } from "@/components/new-team-form";
import { RoleSelect } from "@/components/role-select";
import { TeamLeaderSelect } from "@/components/team-leader-select";
import { TeamLevelsForm } from "@/components/team-levels-form";
import { TeamSelect } from "@/components/team-select";
import { pageGuard, type Auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { URGENCY_CLASS, URGENCY_LABEL, urgencyOf, type Urgency } from "@/lib/urgency";

/** Open tasks per person, counted by urgency, so a person's row can be coloured by their worst task. */
async function urgencyByUser() {
  const today = new Date();
  const [tasks, teams] = await Promise.all([
    db
      .select({ assigneeId: schema.tasks.assigneeId, teamId: schema.tasks.teamId, dueDate: schema.tasks.dueDate, status: schema.tasks.status, startDate: schema.tasks.startDate })
      .from(schema.tasks)
      .where(and(isNull(schema.tasks.deletedAt), ne(schema.tasks.status, "done"))),
    db.select().from(schema.teams),
  ]);
  const levels = new Map(teams.map((t) => [t.id, { approachingHours: t.approachingHours, criticalHours: t.criticalHours }]));
  const day = localDay(today, config.timeZone);
  const byUser = new Map<number, Record<Urgency, number>>();
  for (const t of tasks) {
    if (!t.assigneeId) continue;
    // A repeat copy that has not reached its start date is not active yet.
    if (t.startDate && t.startDate > day) continue;
    const u = urgencyOf(t, levels.get(t.teamId ?? -1) ?? { approachingHours: 72, criticalHours: 24 }, config.timeZone, today);
    if (!u) continue;
    const counts = byUser.get(t.assigneeId) ?? { on_track: 0, approaching: 0, critical: 0 };
    counts[u]++;
    byUser.set(t.assigneeId, counts);
  }
  return byUser;
}

function worst(counts: Record<Urgency, number> | undefined): Urgency {
  if (!counts) return "on_track";
  return (["critical", "approaching", "on_track"] as const).find((u) => counts[u] > 0) ?? "on_track";
}

async function Teams({ auth }: { auth: Auth }) {
  await connection();
  const admin = auth.role === "super_admin";
  const [allTeams, users] = await Promise.all([
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
  ]);
  // A team leader only sees their own team.
  const teams = admin ? allTeams : allTeams.filter((t) => t.id === auth.ledTeam?.id);
  const options = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <div className="space-y-4">
      {admin && <NewTeamForm users={options} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((t) => {
          const members = users.filter((u) => u.teamId === t.id);
          return (
            <section key={t.id} className="card space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{t.name}</h3>
                <div className="flex items-center gap-2">
                  <Link href={`/reports?team=${t.id}`} className="btn py-1">
                    Team report →
                  </Link>
                  {admin && <DeleteTeamButton teamId={t.id} title={t.name} />}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted">Leader</p>
                  {admin ? (
                    <TeamLeaderSelect teamId={t.id} leaderId={t.leaderId} users={options} teamName={t.name} />
                  ) : (
                    <p className="text-sm">{users.find((u) => u.id === t.leaderId)?.name ?? "—"}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted">Members ({members.length})</p>
                  {members.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <span key={m.id} className="badge">
                          {m.name}
                          {m.id === t.leaderId && <span className="ml-1 text-muted">· leader</span>}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted">No members yet. Pick a team for someone below.</p>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs text-muted">Urgency levels: hours left before the due date</p>
                <TeamLevelsForm teamId={t.id} approachingHours={t.approachingHours} criticalHours={t.criticalHours} />
              </div>
            </section>
          );
        })}
        {teams.length === 0 && (
          <p className="card p-6 text-center text-muted lg:col-span-2">
            {admin ? "No teams yet. Add the first one above." : "You don't lead a team yet."}
          </p>
        )}
      </div>
    </div>
  );
}

async function Members({ auth }: { auth: Auth }) {
  await connection();
  const admin = auth.role === "super_admin";
  const [allUsers, teams, urgency] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
    urgencyByUser(),
  ]);
  const users = admin ? allUsers : allUsers.filter((u) => u.teamId === auth.ledTeam?.id);
  const leaderIds = new Set(teams.map((t) => t.leaderId).filter((id) => id !== null));
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name }));
  const teamName = new Map(teams.map((t) => [t.id, t.name]));

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Team</th>
            {admin && <th className="px-3 py-2 font-medium">Role</th>}
            {admin && <th className="px-3 py-2 font-medium">Hubstaff user id</th>}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const counts = urgency.get(u.id);
            const level = worst(counts);
            return (
              <tr
                key={u.id}
                className={`border-b border-border last:border-0 ${
                  level === "critical" ? "bg-red-500/10" : level === "approaching" ? "bg-amber-500/10" : ""
                }`}
              >
                <td className="px-3 py-2">
                  <Link href={`/reports?user=${u.id}`} className="hover:underline">
                    {u.name}
                  </Link>
                  {leaderIds.has(u.id) && <span className="badge ml-2">Leader</span>}
                  {u.role === "super_admin" && <span className="badge ml-2">Super admin</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${URGENCY_CLASS[level]}`}>{URGENCY_LABEL[level]}</span>
                    {counts && (counts.critical > 0 || counts.approaching > 0) && (
                      <span className="text-xs text-muted">
                        {[
                          counts.critical ? `${counts.critical} critical` : "",
                          counts.approaching ? `${counts.approaching} approaching` : "",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted">{u.email}</td>
                <td className="px-3 py-2">
                  {admin ? (
                    <TeamSelect userId={u.id} teamId={u.teamId} teams={teamOptions} name={u.name} />
                  ) : (
                    (teamName.get(u.teamId ?? -1) ?? "No team")
                  )}
                </td>
                {admin && (
                  <td className="px-3 py-2">
                    <RoleSelect userId={u.id} role={u.role} name={u.name} />
                  </td>
                )}
                {admin && (
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
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function TeamContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-semibold">{admin ? "Teams" : "Your team"}</h2>
        <p className="max-w-2xl text-sm text-muted">
          {admin
            ? "Each person is in one team, so team totals never count the same hours twice. A team's leader is also a member of it. "
            : ""}
          The urgency levels decide when a task turns <b>Approaching</b> or <b>Critical</b>, counted in hours until its
          due date. Overdue tasks are always Critical. Only the team leader (or a super admin) can change them.
        </p>
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Teams auth={auth} />
        </Suspense>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">People</h2>
        <p className="max-w-2xl text-sm text-muted">
          The status shows each person&apos;s most urgent open task.
          {admin
            ? " Hubstaff time is matched to people by their Hubstaff user id. Without it, Start can't assign the Hubstaff task to them and their hours show as unmatched."
            : ""}
        </p>
        {admin && <AddMemberForm />}
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Members auth={auth} />
        </Suspense>
      </section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Team</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <TeamContent />
      </Suspense>
    </div>
  );
}
