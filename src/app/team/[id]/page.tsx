import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { TeamLeaderSelect } from "@/components/team-leader-select";
import { TeamLevelsForm } from "@/components/team-levels-form";
import { WidgetBody } from "@/components/dashboard/widgets";
import { canManageTeam, pageGuard } from "@/lib/auth";

const Loading = () => <p className="py-6 text-center text-sm text-muted">Loading…</p>;

/** One team's tasks: counts, who has what, and the open tasks. The Team page itself is only for setting teams up. */
async function TeamDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const team = await db.query.teams.findFirst({ where: eq(schema.teams.id, id) });
  if (!team) notFound();
  // A leader can only open their own team.
  if (!canManageTeam(auth, id)) redirect("/team");
  const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.name));
  const options = allUsers.map((u) => ({ id: u.id, name: u.name, teamId: u.teamId }));
  const leader = allUsers.find((u) => u.id === team.leaderId) ?? null;

  return (
    <div className="space-y-6">
      <header className="card flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h1 className="text-xl font-semibold">{team.name}</h1>
          <p className="text-sm text-muted">Leader: {leader?.name ?? "none yet"}</p>
        </div>
        <Link href={`/reports?team=${team.id}`} className="btn">
          Hours report →
        </Link>
      </header>

      <section className="card p-4">
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

      <section className="card overflow-hidden">
        <header className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Team settings</h2>
        </header>
        <div className={`grid gap-6 p-4 ${auth.role === "super_admin" ? "lg:grid-cols-[18rem_1fr]" : ""}`}>
          {auth.role === "super_admin" && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Team leader</h3>
              <p className="text-xs text-muted">The leader sees this team&apos;s tasks and reports, and sets its urgency levels. Pick one person; the change saves straight away.</p>
              <TeamLeaderSelect teamId={team.id} leaderId={team.leaderId} users={options} teamName={team.name} />
            </div>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Urgency levels</h3>
            <p className="text-xs text-muted">How many hours before its due date a task becomes Approaching or Critical.</p>
            <TeamLevelsForm teamId={team.id} approachingHours={team.approachingHours} criticalHours={team.criticalHours} />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function TeamDetailPage({ params }: PageProps<"/team/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <TeamDetail params={params} />
    </Suspense>
  );
}
