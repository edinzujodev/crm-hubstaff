"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireCurrentUser, USER_COOKIE } from "@/lib/current-user";
import { ensureHubstaffTask, finishSession, startSession } from "@/lib/sessions";
import { lastSyncAt, syncHubstaff, type SyncResult } from "@/lib/sync";

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
});

/** Saves the task, then creates it in Hubstaff. If Hubstaff fails the task is kept and Start retries. */
export async function createTask(_prev: unknown, formData: FormData): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const input = newTask.parse(Object.fromEntries(formData));
    const [task] = await db.insert(schema.tasks).values(input).returning();
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

/** Removes the task and its CRM sessions. Hubstaff time stays in the mirror as unmatched; the Hubstaff task is not touched. */
export async function deleteTask(taskId: number) {
  return run(async () => {
    await db.transaction(async (tx) => {
      await tx.update(schema.hubstaffActivities).set({ taskId: null }).where(eq(schema.hubstaffActivities.taskId, taskId));
      await tx.delete(schema.workSessions).where(eq(schema.workSessions.taskId, taskId));
      await tx.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    });
    return undefined;
  });
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
    return undefined;
  });
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

export async function setHubstaffUserId(userId: number, formData: FormData) {
  const raw = formData.get("hubstaffUserId");
  const hubstaffUserId = raw ? z.coerce.number().int().positive().parse(raw) : null;
  await db.update(schema.users).set({ hubstaffUserId }).where(eq(schema.users.id, userId));
  refresh();
}
