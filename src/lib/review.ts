import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Auth } from "@/lib/auth";

/**
 * Who reviews a finished task: the leader of the assignee's team. When the assignee is that leader, their own
 * tasks go up to the leader of the team their team reports to. Null when nobody above them exists.
 */
export async function reviewerFor(task: { assigneeId: number | null; teamId: number | null }): Promise<number | null> {
  let teamId = task.teamId;
  if (task.assigneeId) {
    const assignee = await db.query.users.findFirst({ where: eq(schema.users.id, task.assigneeId), columns: { teamId: true } });
    teamId = assignee?.teamId ?? teamId;
  }
  const seen = new Set<number>();
  while (teamId !== null && !seen.has(teamId)) {
    seen.add(teamId);
    const team = await db.query.teams.findFirst({
      where: eq(schema.teams.id, teamId),
      columns: { leaderId: true, parentTeamId: true },
    });
    if (!team) return null;
    if (team.leaderId !== null && team.leaderId !== task.assigneeId) return team.leaderId;
    teamId = team.parentTeamId;
  }
  return null;
}

/** Only the chosen reviewer (the team leader) reviews a task, and never the person who has it. */
export function canReviewTask(
  auth: Auth,
  task: { status: string; reviewerId: number | null; assigneeId: number | null },
): boolean {
  return task.status === "review" && task.reviewerId === auth.user.id && task.assigneeId !== auth.user.id;
}
