import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { config } from "@/lib/config";
import { hubstaff } from "@/lib/hubstaff";
import { MOCK_PROJECT_ID } from "@/lib/hubstaff/mock";

export async function openSessionFor(userId: number) {
  return db.query.workSessions.findFirst({
    where: and(eq(schema.workSessions.userId, userId), isNull(schema.workSessions.endedAt)),
  });
}

/** Creates the Hubstaff task the first time a CRM task is started. */
async function ensureHubstaffTask(task: schema.Task, user: schema.User) {
  const provider = hubstaff();
  if (task.hubstaffTaskId) {
    // Hubstaff only lets the assignee track a task, so follow whoever starts it.
    if (task.assigneeId !== user.id && user.hubstaffUserId) {
      await provider.assignTask(task.hubstaffTaskId, user.hubstaffUserId);
      await db.update(schema.tasks).set({ assigneeId: user.id }).where(eq(schema.tasks.id, task.id));
    }
    return task.hubstaffTaskId;
  }

  const client = task.clientId
    ? await db.query.clients.findFirst({ where: eq(schema.clients.id, task.clientId) })
    : null;
  const projectId =
    client?.hubstaffProjectId ?? config.hubstaffProjectId ?? (provider.mode === "mock" ? MOCK_PROJECT_ID : null);
  if (!projectId) throw new Error("Set HUBSTAFF_PROJECT_ID (or the client's Hubstaff project) before starting tasks.");

  const created = await provider.createTask({
    crmTaskId: task.id,
    projectId,
    summary: client ? `${client.name}: ${task.title} [CRM #${task.id}]` : `${task.title} [CRM #${task.id}]`,
    assigneeHubstaffUserId: user.hubstaffUserId,
  });
  await db
    .update(schema.tasks)
    .set({ hubstaffTaskId: created.id, hubstaffProjectId: created.projectId, assigneeId: user.id })
    .where(eq(schema.tasks.id, task.id));
  return created.id;
}

export async function startSession(taskId: number, userId: number) {
  const [task, user] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) }),
    db.query.users.findFirst({ where: eq(schema.users.id, userId) }),
  ]);
  if (!task) throw new Error("Task not found");
  if (!user) throw new Error("User not found");
  if (task.status === "done") throw new Error("Task is done; reopen it first.");

  const hubstaffTaskId = await ensureHubstaffTask(task, user);
  const now = new Date();

  const open = await openSessionFor(userId);
  if (open?.taskId === taskId) return { sessionId: open.id, hubstaffTaskId };
  // One person can only track one Hubstaff task at a time, so starting a new
  // task ends the previous session, like the Hubstaff timer does.
  if (open) {
    await db
      .update(schema.workSessions)
      .set({ endedAt: now, endReason: "switched" })
      .where(eq(schema.workSessions.id, open.id));
  }

  const [session] = await db
    .insert(schema.workSessions)
    .values({ taskId, userId, startedAt: now })
    .returning({ id: schema.workSessions.id });
  if (task.status === "todo") {
    await db.update(schema.tasks).set({ status: "in_progress" }).where(eq(schema.tasks.id, taskId));
  }
  return { sessionId: session.id, hubstaffTaskId };
}

export async function finishSession(userId: number) {
  const open = await openSessionFor(userId);
  if (!open) return null;
  await db
    .update(schema.workSessions)
    .set({ endedAt: new Date(), endReason: "finished" })
    .where(eq(schema.workSessions.id, open.id));
  return open.taskId;
}
