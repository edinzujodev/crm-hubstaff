import Link from "next/link";
import { Suspense } from "react";
import { and, asc, isNull, ne } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { Avatar } from "@/components/avatar";
import { DeleteTeamButton } from "@/components/delete-team-button";
import { PeopleList, type Person } from "@/components/people-list";
import { TeamLeaderSelect } from "@/components/team-leader-select";
import { TeamLevelsForm } from "@/components/team-levels-form";
import { AddMemberButton, NewTeamButton } from "@/components/team-popups";
import { pageGuard } from "@/lib/auth";
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

async function TeamContent() {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const admin = auth.role === "super_admin";
  const [allUsers, allTeams, urgency] = await Promise.all([
    db.select().from(schema.users).orderBy(asc(schema.users.name)),
    db.select().from(schema.teams).orderBy(asc(schema.teams.name)),
    urgencyByUser(),
  ]);
  // A team leader only sees their own team.
  const teams = admin ? allTeams : allTeams.filter((t) => t.id === auth.ledTeam?.id);
  const users = admin ? allUsers : allUsers.filter((u) => u.teamId === auth.ledTeam?.id);
  const leaderIds = new Set(allTeams.map((t) => t.leaderId).filter((id) => id !== null));
  const options = allUsers.map((u) => ({ id: u.id, name: u.name }));
  const teamOptions = allTeams.map((t) => ({ id: t.id, name: t.name }));

  const people: Person[] = users.map((u) => {
    const counts = urgency.get(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      teamId: u.teamId,
      role: u.role,
      hubstaffUserId: u.hubstaffUserId,
      isLeader: leaderIds.has(u.id),
      level: worst(counts),
      critical: counts?.critical ?? 0,
      approaching: counts?.approaching ?? 0,
    };
  });
  const needAttention = people.filter((p) => p.level !== "on_track").length;
  const missingIds = people.filter((p) => p.hubstaffUserId === null).length;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="People" value={people.length} />
        <Tile label={admin ? "Teams" : "Your team"} value={teams.length} />
        <Tile
          label="Need attention"
          value={needAttention}
          tone={needAttention ? "warn" : undefined}
          hint="People with an approaching or critical task"
        />
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
          hint={
            admin
              ? "Each person is in one team, so team totals never count the same hours twice. A team's leader is also a member of it."
              : undefined
          }
          action={admin ? <NewTeamButton users={options} /> : undefined}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {teams.map((t) => {
            const members = allUsers.filter((u) => u.teamId === t.id);
            const leader = allUsers.find((u) => u.id === t.leaderId);
            let critical = 0;
            let approaching = 0;
            for (const m of members) {
              critical += urgency.get(m.id)?.critical ?? 0;
              approaching += urgency.get(m.id)?.approaching ?? 0;
            }
            return (
              <section key={t.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{t.name}</h3>
                    <p className="text-xs text-muted">
                      {members.length} {members.length === 1 ? "member" : "members"} · Leader: {leader?.name ?? "none yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/reports?team=${t.id}`} className="btn py-1">
                      Team report →
                    </Link>
                    {admin && <DeleteTeamButton teamId={t.id} title={t.name} />}
                  </div>
                </header>

                <div className="flex flex-wrap gap-2 px-4 pb-3">
                  {critical > 0 && <span className={`badge ${URGENCY_CLASS.critical}`}>{critical} critical</span>}
                  {approaching > 0 && <span className={`badge ${URGENCY_CLASS.approaching}`}>{approaching} approaching</span>}
                  {critical === 0 && approaching === 0 && <span className={`badge ${URGENCY_CLASS.on_track}`}>All on track</span>}
                </div>

                {members.length ? (
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
                    {members.map((m) => {
                      const level = worst(urgency.get(m.id));
                      return (
                        <li key={m.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-primary/5">
                          <Avatar name={m.name} size="sm" />
                          <Link href={`/reports?user=${m.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                            {m.name}
                            {m.id === t.leaderId && <span className="ml-2 text-xs text-muted">leader</span>}
                          </Link>
                          {level !== "on_track" && <span className={`badge ${URGENCY_CLASS[level]}`}>{URGENCY_LABEL[level]}</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="border-t border-border px-4 py-5 text-sm text-muted">
                    No members yet.{admin ? " Pick this team for someone in the People list below." : ""}
                  </p>
                )}

                <details className="group border-t border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-primary/5">
                    <span className="font-medium">Team settings</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      Approaching under {t.approachingHours}h · Critical under {t.criticalHours}h
                      <span aria-hidden className="transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </span>
                  </summary>
                  <div className="space-y-4 border-t border-border p-4">
                    {admin && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted">Leader</p>
                        <TeamLeaderSelect teamId={t.id} leaderId={t.leaderId} users={options} teamName={t.name} />
                      </div>
                    )}
                    <div className="space-y-2">
                      <p className="text-xs text-muted">
                        When a task turns <b>Approaching</b> or <b>Critical</b>, in hours before its due date. Overdue tasks
                        are always Critical.
                      </p>
                      <TeamLevelsForm teamId={t.id} approachingHours={t.approachingHours} criticalHours={t.criticalHours} />
                    </div>
                  </div>
                </details>
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
          hint={
            admin
              ? "Hubstaff time is matched to people by their Hubstaff user id. Without it, Start can't assign the Hubstaff task to them and their hours show as unmatched."
              : "Each person's most urgent open task."
          }
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
