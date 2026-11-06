"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireCurrentUser, USER_COOKIE } from "@/lib/current-user";
import { hubstaff } from "@/lib/hubstaff";
import { spawnNextRepeat } from "@/lib/recurring";
import { markDeleted, unmarkDeleted } from "@/lib/soft-delete";
import { ensureHubstaffTask, finishSession, startSession } from "@/lib/sessions";
import { backfillHubstaff, lastSyncAt, syncHubstaff, type SyncResult } from "@/lib/sync";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function switchUser(formData: FormData) {
  const id = z.coerce.number().int().positive().parse(formData.get("userId"));
  (await cookies()).set(USER_COOKIE, String(id), { httpOnly: true, sameSite: "lax", path: "/" });
  refresh();
}

const newTask = z.object({
  title: z.string().trim().min(1, "Title is required"),
  clientId: z.coerce.number({ error: "Pick a client" }).int().positive("Pick a client"),
  assigneeId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  dueDate: z.string().optional().transform((v) => v || undefined),
  repeat: z.enum(["weekly", "monthly"]).optional().or(z.literal("").transform(() => undefined)),
});

/** Saves the task, then creates it in Hubstaff. If Hubstaff fails the task is kept and Start retries. */
export async function createTask(_prev: unknown, formData: FormData): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const input = newTask.parse(Object.fromEntries(formData));
    // The next due date is calculated from this one, so a repeating task needs it.
    if (input.repeat && !input.dueDate) throw new Error("A repeating task needs a due date");
    const repeatDay = input.repeat === "monthly" && input.dueDate ? Number(input.dueDate.slice(8, 10)) : undefined;
    const [task] = await db.insert(schema.tasks).values({ ...input, repeatDay }).returning();
    const assignee = task.assigneeId
      ? await db.query.users.findFirst({ where: eq(schema.users.id, task.assigneeId) })
      : null;
    try {
      await ensureHubstaffTask(task, assignee ?? null);
      return {};
    } catch (e) {
      return { hubstaffError: e instanceof Error ? e.message : String(e) };
    }
  });
}

/**
 * Soft delete: the task is hidden in the CRM and its Hubstaff title gets a
 * "[SOFT-DELETED]" prefix. Nothing is removed, so Hubstaff time and reports
 * keep working. A running session on it is ended.
 */
export async function deleteTask(taskId: number): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
    if (!task) throw new Error("Task not found");
    if (task.deletedAt) return {};
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(schema.workSessions)
        .set({ endedAt: now, endReason: "finished" })
        .where(and(eq(schema.workSessions.taskId, taskId), isNull(schema.workSessions.endedAt)));
      await tx.update(schema.tasks).set({ deletedAt: now }).where(eq(schema.tasks.id, taskId));
    });
    return renameInHubstaff(task.hubstaffTaskId, markDeleted);
  });
}

export async function restoreTask(taskId: number): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
    if (!task) throw new Error("Task not found");
    await db.update(schema.tasks).set({ deletedAt: null }).where(eq(schema.tasks.id, taskId));
    return renameInHubstaff(task.hubstaffTaskId, unmarkDeleted);
  });
}

/** The CRM change is already saved; a Hubstaff failure is reported, not thrown. */
async function renameInHubstaff(hubstaffTaskId: number | null, rename: (title: string) => string) {
  if (!hubstaffTaskId) return {};
  try {
    await hubstaff().renameTask(hubstaffTaskId, rename);
    return {};
  } catch (e) {
    return { hubstaffError: e instanceof Error ? e.message : String(e) };
  }
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined);

const newClient = z.object({
  name: z.string().trim().min(1, "Name is required"),
  contactName: optionalText,
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText,
  notes: optionalText,
  hubstaffProjectId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

export async function createClient(_prev: unknown, formData: FormData): Promise<Result<{ id: number }>> {
  return run(async () => {
    const input = newClient.parse(Object.fromEntries(formData));
    const [client] = await db.insert(schema.clients).values(input).returning({ id: schema.clients.id });
    return client;
  });
}

const leadFields = {
  name: z.string().trim().min(1, "Name is required"),
  contactName: optionalText,
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText,
  source: optionalText,
  notes: optionalText,
  ownerId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  expectedMonthlyValue: z.coerce.number().int().min(0).optional().or(z.literal("").transform(() => undefined)),
};
const newLead = z.object(leadFields);
const editLead = z.object({
  ...leadFields,
  status: z.enum(["new", "contacted", "meeting", "proposal", "lost"]),
  lostReason: optionalText,
});

export async function createLead(_prev: unknown, formData: FormData): Promise<Result<{ id: number }>> {
  return run(async () => {
    const input = newLead.parse(Object.fromEntries(formData));
    const [lead] = await db.insert(schema.leads).values(input).returning({ id: schema.leads.id });
    return lead;
  });
}

/** Saves the lead's details. Optional fields that were cleared are set back to empty. */
export async function updateLead(leadId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
    if (!lead) throw new Error("Lead not found");
    const input = editLead.parse(Object.fromEntries(formData));
    await db
      .update(schema.leads)
      .set({
        name: input.name,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        notes: input.notes ?? null,
        ownerId: input.ownerId ?? null,
        expectedMonthlyValue: input.expectedMonthlyValue ?? null,
        // A converted lead stays "won".
        ...(lead.clientId ? {} : { status: input.status, lostReason: input.status === "lost" ? (input.lostReason ?? null) : null }),
      })
      .where(eq(schema.leads.id, leadId));
    return undefined;
  });
}

export async function setLeadStatus(leadId: number, status: "new" | "contacted" | "meeting" | "proposal" | "lost") {
  return run(async () => {
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
    if (!lead) throw new Error("Lead not found");
    if (lead.clientId) throw new Error("This lead is already a client.");
    await db
      .update(schema.leads)
      .set({ status, ...(status === "lost" ? {} : { lostReason: null }) })
      .where(eq(schema.leads.id, leadId));
    return undefined;
  });
}

/** Turns a lead into a client (copying its details) and marks the lead won. */
export async function convertLead(leadId: number): Promise<Result<{ clientId: number }>> {
  return run(() =>
    db.transaction(async (tx) => {
      const lead = await tx.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
      if (!lead) throw new Error("Lead not found");
      if (lead.clientId) return { clientId: lead.clientId };
      const [client] = await tx
        .insert(schema.clients)
        .values({
          name: lead.name,
          contactName: lead.contactName,
          email: lead.email,
          phone: lead.phone,
          notes: lead.notes,
        })
        .returning({ id: schema.clients.id });
      await tx
        .update(schema.leads)
        .set({ status: "won", clientId: client.id, convertedAt: new Date(), lostReason: null })
        .where(eq(schema.leads.id, leadId));
      return { clientId: client.id };
    }),
  );
}

/** Deletes a lead that was never converted. Converted leads are kept as history. */
export async function deleteLead(leadId: number) {
  return run(async () => {
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
    if (lead?.clientId) throw new Error("This lead became a client, so it is kept as history.");
    await db.delete(schema.leads).where(eq(schema.leads.id, leadId));
    return undefined;
  });
}

export async function startTask(taskId: number) {
  return run(async () => {
    const user = await requireCurrentUser();
    return startSession(taskId, user.id);
  });
}

export async function finishTask(): Promise<Result<{ sync: SyncResult | null; syncError?: string }>> {
  return run(async () => {
    const user = await requireCurrentUser();
    await finishSession(user.id);
    // Pull right away so the report shows the time; Hubstaff can lag up to ~20
    // min, and later syncs pick up the rest.
    try {
      return { sync: await syncHubstaff() };
    } catch (e) {
      return { sync: null, syncError: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function setTaskStatus(taskId: number, status: "todo" | "in_progress" | "done") {
  return run(async () => {
    await db.update(schema.tasks).set({ status }).where(eq(schema.tasks.id, taskId));
    // A repeating task creates its next copy when it is marked done.
    const nextTaskId = status === "done" ? await spawnNextRepeat(taskId) : null;
    return { nextTaskId };
  });
}

/** Stops a task from repeating (future copies only; existing ones are untouched). */
export async function stopRepeating(taskId: number) {
  return run(async () => {
    await db.update(schema.tasks).set({ repeat: null, repeatDay: null }).where(eq(schema.tasks.id, taskId));
    return undefined;
  });
}

/** Pulls older Hubstaff time for the range being reported, so reports can cover it. */
export async function loadHubstaffRange(from: string, to: string) {
  return run(() => backfillHubstaff(from, to));
}

export async function syncNow() {
  return run(() => syncHubstaff());
}

/** Called by the page every few minutes; skips if a sync ran recently. */
export async function syncIfStale() {
  const last = await lastSyncAt();
  if (last && Date.now() - last.getTime() < 2 * 60 * 1000) return { ok: true as const, data: null };
  return run(() => syncHubstaff());
}

const member = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  hubstaffUserId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

export async function addMember(_prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await db.insert(schema.users).values(member.parse(Object.fromEntries(formData)));
    return undefined;
  });
}

const newTeam = z.object({
  name: z.string().trim().min(1, "Team name is required"),
  leaderId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

/** The leader is also made a member of the team (moving them out of any other team). */
async function assignLeader(tx: Pick<typeof db, "update">, teamId: number, leaderId: number | null) {
  await tx.update(schema.teams).set({ leaderId }).where(eq(schema.teams.id, teamId));
  if (leaderId) {
    await tx
      .update(schema.teams)
      .set({ leaderId: null })
      .where(and(eq(schema.teams.leaderId, leaderId), ne(schema.teams.id, teamId)));
    await tx.update(schema.users).set({ teamId }).where(eq(schema.users.id, leaderId));
  }
}

export async function createTeam(_prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    const input = newTeam.parse(Object.fromEntries(formData));
    try {
      await db.transaction(async (tx) => {
        const [team] = await tx.insert(schema.teams).values({ name: input.name }).returning({ id: schema.teams.id });
        if (input.leaderId) await assignLeader(tx, team.id, input.leaderId);
      });
    } catch (e) {
      if (String(e instanceof Error ? (e.cause ?? e) : e).includes("teams_name_unique")) {
        throw new Error(`A team called "${input.name}" already exists.`);
      }
      throw e;
    }
    return undefined;
  });
}

export async function setTeamLeader(teamId: number, leaderId: number | null) {
  return run(async () => {
    await db.transaction((tx) => assignLeader(tx, teamId, leaderId));
    return undefined;
  });
}

/** Moves a person into a team, or out of any team with null. A leader who moves out stops leading. */
export async function setUserTeam(userId: number, teamId: number | null) {
  return run(async () => {
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ teamId }).where(eq(schema.users.id, userId));
      const leads = and(eq(schema.teams.leaderId, userId), teamId ? ne(schema.teams.id, teamId) : undefined);
      await tx.update(schema.teams).set({ leaderId: null }).where(leads);
    });
    return undefined;
  });
}

/** Deletes the team itself; its members stay and become "no team". */
export async function deleteTeam(teamId: number) {
  return run(async () => {
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ teamId: null }).where(eq(schema.users.teamId, teamId));
      await tx.update(schema.teams).set({ leaderId: null }).where(eq(schema.teams.id, teamId));
      await tx.delete(schema.teams).where(eq(schema.teams.id, teamId));
    });
    return undefined;
  });
}

export async function setHubstaffUserId(userId: number, formData: FormData) {
  const raw = formData.get("hubstaffUserId");
  const hubstaffUserId = raw ? z.coerce.number().int().positive().parse(raw) : null;
  await db.update(schema.users).set({ hubstaffUserId }).where(eq(schema.users.id, userId));
  refresh();
}
