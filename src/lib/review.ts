import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Auth } from "@/lib/auth";
import type { ReviewEntry } from "@/components/review-history";

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

/** The review history of the given tasks, newest first, grouped by task. */
export async function reviewsByTask(taskIds: number[]) {
  const out = new Map<number, ReviewEntry[]>();
  if (!taskIds.length) return out;
  const rows = await db
    .select({
      id: schema.taskReviews.id,
      taskId: schema.taskReviews.taskId,
      result: schema.taskReviews.result,
      note: schema.taskReviews.note,
      at: schema.taskReviews.createdAt,
      reviewerName: schema.users.name,
    })
    .from(schema.taskReviews)
    .leftJoin(schema.users, eq(schema.taskReviews.reviewerId, schema.users.id))
    .where(inArray(schema.taskReviews.taskId, taskIds))
    .orderBy(desc(schema.taskReviews.createdAt), desc(schema.taskReviews.id));
  for (const r of rows) out.set(r.taskId, [...(out.get(r.taskId) ?? []), r]);
  return out;
}
