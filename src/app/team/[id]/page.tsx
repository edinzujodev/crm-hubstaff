import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
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
  const leader = team.leaderId ? await db.query.users.findFirst({ where: eq(schema.users.id, team.leaderId) }) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/team" className="text-sm text-muted hover:underline">
            ← Team setup
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{team.name}</h1>
          <p className="text-sm text-muted">Leader: {leader?.name ?? "none yet"}</p>
        </div>
        <Link href={`/reports?team=${team.id}`} className="btn">
          Hours report →
        </Link>
      </div>

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
