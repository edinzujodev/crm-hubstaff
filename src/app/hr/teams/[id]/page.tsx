import { DetailSkeleton, TableSkeleton } from "@/components/page-skeleton";
import { Crumb } from "@/components/crumb";
import { BackButton } from "@/components/back-button";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TeamMembers } from "@/components/team-members";
import { EditTeamButton } from "@/components/team-popups";
import { WidgetBody } from "@/components/dashboard/widgets";
import { canManageTeam, pageGuard } from "@/lib/auth";
import { ReportsToSelect } from "@/components/reports-to-select";
import { ReviewActions } from "@/components/review-actions";
import { canReviewTask } from "@/lib/review";
import { fmtDateTime } from "@/lib/format";
import { config } from "@/lib/config";

const Loading = () => <TableSkeleton rows={3} />;

/** One team's tasks: counts, who has what, and the open tasks. HR → Teams is only for setting teams up. */
async function TeamDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const team = await db.query.teams.findFirst({ where: eq(schema.teams.id, id) });
  if (!team) notFound();
  // A leader can only open their own team.
  if (!canManageTeam(auth, id)) redirect("/hr/teams");
  const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const leader = allUsers.find((u) => u.id === team.leaderId) ?? null;
  const admin = auth.role === "super_admin";
  const members = allUsers.filter((u) => u.teamId === id);
  const teamNames = new Map((await db.select().from(schema.teams)).map((t) => [t.id, t.name]));
  const allTeams = await db.select().from(schema.teams);
  // Everything this team's leader has to review, including the tasks of leaders who report to them.
  const toReview = team.leaderId
    ? await db
        .select({ task: schema.tasks, assigneeName: schema.users.name })
        .from(schema.tasks)
        .leftJoin(schema.users, eq(schema.tasks.assigneeId, schema.users.id))
        .where(and(eq(schema.tasks.status, "review"), eq(schema.tasks.reviewerId, team.leaderId)))
        .orderBy(asc(schema.tasks.submittedAt))
    : [];
  const pickerUsers = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    teamName: u.teamId && u.teamId !== id ? (teamNames.get(u.teamId) ?? null) : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallback="/hr/teams" />
      </div>
      <header className="card flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h1 className="text-xl font-semibold">{team.name}</h1>
          <Crumb name={team.name} />
          <p className="text-sm text-muted">Leader: {leader?.name ?? "none yet"}</p>
        </div>
        <div className="flex gap-2">
          {admin && (
            <EditTeamButton
              team={{ id: team.id, name: team.name, leaderId: team.leaderId, memberIds: members.map((m) => m.id) }}
              users={pickerUsers}
            />
          )}
          <Link href={`/reports?team=${team.id}`} className="btn">
            Hours report →
          </Link>
        </div>
      </header>

      <section className="card border-amber-500/40 p-4">
        <h2 className="mb-2 font-semibold">
          Waiting for review <span className="font-mono text-sm font-normal text-muted">{toReview.length}</span>
        </h2>
        {toReview.length === 0 ? (
          <p className="text-sm text-muted">Nothing to review. Finished tasks from {leader?.name ?? "the team"}&apos;s team land here.</p>
        ) : (
          <ul className="divide-y divide-border">
            {toReview.map(({ task, assigneeName }) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                    {task.title}
                  </Link>
                  <span className="text-muted">
                    {" "}
                    · {assigneeName ?? "—"}
                    {task.submittedAt && ` · sent ${fmtDateTime(task.submittedAt, config.timeZone)}`}
                  </span>
                </span>
                {canReviewTask(auth, task) && <ReviewActions taskId={task.id} title={task.title} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Members ({members.length})</h2>
        <TeamMembers
          canEdit={admin}
          members={members.map((m) => ({ id: m.id, name: m.name, email: m.email, isLeader: m.id === team.leaderId }))}
        />
      </section>

      <section className="card overflow-hidden">
        <header className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Team settings</h2>
        </header>
        <div className="space-y-2 p-4">
          <h3 className="text-sm font-medium">Who reviews the leader&apos;s own tasks</h3>
          <p className="text-xs text-muted">
            The leader of this team reviews everyone else&apos;s finished tasks. Pick the team leader who reviews{" "}
            {leader?.name ?? "this team’s leader"}&apos;s own tasks.
          </p>
          {admin ? (
            <ReportsToSelect
              teamId={team.id}
              value={team.parentTeamId}
              teams={allTeams.map((t) => ({ id: t.id, name: t.name, leaderName: allUsers.find((u) => u.id === t.leaderId)?.name ?? null }))}
            />
          ) : (
            <p className="text-sm">
              {allUsers.find((u) => u.id === allTeams.find((t) => t.id === team.parentTeamId)?.leaderId)?.name ?? "Nobody"}
            </p>
          )}
        </div>
      </section>

      <section className="card @container p-4">
        <Suspense fallback={<Loading />}>
          <WidgetBody type="task-counts" raw={{ who: "team", teamId: id }} auth={auth} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Who has what</h2>
        <Suspense fallback={<Loading />}>
          <WidgetBody type="team-workload" raw={{ teamId: id, range: "this_week" }} auth={auth} />
        </Suspense>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Open tasks</h2>
        <Suspense fallback={<Loading />}>
          <WidgetBody type="tasks" raw={{ who: "team", teamId: id, limit: 50 }} auth={auth} />
        </Suspense>
      </section>
    </div>
  );
}

export default function TeamDetailPage({ params }: PageProps<"/hr/teams/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <TeamDetail params={params} />
    </Suspense>
  );
}
