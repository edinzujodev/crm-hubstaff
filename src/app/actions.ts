"use server";

import { and, count, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireCurrentUser } from "@/lib/current-user";
import { authMode, createSession, destroySession, findApprovedUser } from "@/lib/session";
import { canManageTeam, requireAuth, requireRole, requireTask } from "@/lib/auth";
import { hubstaff } from "@/lib/hubstaff";
import { defaultLeadDays, hubstaffSummary, spawnNextRepeat } from "@/lib/recurring";
import { showFrom } from "@/lib/repeat-show";
import { localDay } from "@/lib/format";
import { config } from "@/lib/config";
import { resolveProject } from "@/lib/projects";
import { markDeleted, unmarkDeleted } from "@/lib/soft-delete";
import { ensureHubstaffTask, finishSession, startSession } from "@/lib/sessions";
import { backfillHubstaff, syncHubstaff, type SyncResult } from "@/lib/sync";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(". ") };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Stand-in for Google sign-in, for development only: signs in as an approved email without a password.
 * It is off as soon as GOOGLE_CLIENT_ID is set, and never works in production.
 */
export async function mockSignIn(_prev: unknown, formData: FormData): Promise<{ error: string } | null> {
  if (authMode() !== "mock") return { error: "Simulated sign-in is turned off." };
  const user = await findApprovedUser(String(formData.get("email") ?? ""));
  if (!user) return { error: "That account isn't on the approved list. Ask a super admin to add your email on the Teams & people page." };
  await createSession(user.id);
  redirect("/");
}

/** Development quick-switch between people (same rules as mockSignIn). */
export async function switchUser(formData: FormData) {
  if (authMode() !== "mock") return;
  const id = z.coerce.number().int().positive().parse(formData.get("userId"));
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
  if (!user) return;
  await createSession(user.id);
  refresh();
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

const newTask = z.object({
  title: z.string().trim().min(1, "Title is required"),
  clientId: z.coerce.number({ error: "Pick a client" }).int().positive("Pick a client"),
  assigneeId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  dueDate: z.string().optional().transform((v) => v || undefined),
  repeat: z.enum(["weekly", "monthly"]).optional().or(z.literal("").transform(() => undefined)),
  // Days before the due date that each new copy appears in the open lists.
  repeatLeadDays: z.coerce.number().int().min(0).max(90).optional().or(z.literal("").transform(() => undefined)),
  // When each new copy appears in the open lists: some days before due (repeatLeadDays), at the start of the week or month, or on the due day.
  repeatShow: z.enum(["days_before", "week_start", "month_start", "due_day"]).optional().or(z.literal("").transform(() => undefined)),
  // The project the task belongs to: one of the client's existing projects (projectId), or a new one by name.
  projectId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  projectName: z.string().trim().max(120).optional(),
  projectKind: z.enum(["one_off", "ongoing"]).optional().or(z.literal("").transform(() => undefined)),
});

/** The chosen project of the client, or a new one when only a name was given. */
async function pickProject(
  clientId: number,
  projectId: number | undefined,
  name: string | undefined,
  kind: "one_off" | "ongoing" | undefined,
  fallback: string,
) {
  if (!projectId) return resolveProject(clientId, name, kind, fallback);
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project || project.clientId !== clientId) throw new Error("That project belongs to another client. Pick one of this client's projects.");
  return project;
}

/** Saves the task, then creates it in Hubstaff. If Hubstaff fails the task is kept and Start retries. */
export async function createTask(_prev: unknown, formData: FormData): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const auth = await requireRole("super_admin", "leader");
    const { projectId, projectName, projectKind, ...input } = newTask.parse(Object.fromEntries(formData));
    // The next due date is calculated from this one, so a repeating task needs it.
    if (input.repeat && !input.dueDate) throw new Error("A repeating task needs a due date");
    const repeatDay = input.repeat === "monthly" && input.dueDate ? Number(input.dueDate.slice(8, 10)) : undefined;
    const repeatShow = input.repeat ? (input.repeatShow ?? "days_before") : undefined;
    const repeatLeadDays = input.repeat && repeatShow === "days_before" ? (input.repeatLeadDays ?? defaultLeadDays(input.repeat)) : undefined;
    const picked = input.assigneeId
      ? await db.query.users.findFirst({ where: eq(schema.users.id, input.assigneeId) })
      : null;
    if (auth.role === "leader" && picked && picked.teamId !== auth.ledTeam?.id) {
      throw new Error("You can only assign tasks to people in your team.");
    }
    const teamId = picked?.teamId ?? auth.ledTeam?.id ?? null;
    const project = await pickProject(input.clientId, projectId, projectName, projectKind, input.title);
    const [created] = await db
      .insert(schema.tasks)
      .values({ ...input, projectId: project.id, repeatDay, repeatLeadDays, repeatShow, teamId })
      .returning();
    // The first task of a repeating series is the series' id; every copy keeps it.
    const [task] = input.repeat
      ? await db.update(schema.tasks).set({ seriesId: created.id }).where(eq(schema.tasks.id, created.id)).returning()
      : [created];
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
    const { task } = await requireTask(taskId, "manage");
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
    const { task } = await requireTask(taskId, "manage");
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
  kind: z.enum(["company", "group"]).default("company"),
  contactName: optionalText,
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText,
  notes: optionalText,
  hubstaffProjectId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

export async function createClient(_prev: unknown, formData: FormData): Promise<Result<{ id: number }>> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = newClient.parse(Object.fromEntries(formData));
    const [client] = await db.insert(schema.clients).values(input).returning({ id: schema.clients.id });
    return client;
  });
}

/** Adds a project to a client. */
export async function createProject(clientId: number, _prev: unknown, formData: FormData): Promise<Result<{ id: number }>> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = z
      .object({ name: z.string().trim().min(1, "Name is required").max(120), kind: z.enum(["one_off", "ongoing"]) })
      .parse(Object.fromEntries(formData));
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
    if (!client) throw new Error("Client not found");
    const clash = await db.query.projects.findFirst({
      where: and(eq(schema.projects.clientId, clientId), sql`lower(${schema.projects.name}) = lower(${input.name})`),
    });
    if (clash) throw new Error("This client already has a project with that name.");
    const [project] = await db.insert(schema.projects).values({ clientId, ...input }).returning({ id: schema.projects.id });
    return project;
  });
}

/** Renames a project or changes whether it is one-off or ongoing. */
export async function updateProject(projectId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = z
      .object({ name: z.string().trim().min(1, "Name is required").max(120), kind: z.enum(["one_off", "ongoing"]) })
      .parse(Object.fromEntries(formData));
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw new Error("Project not found");
    const clash = await db.query.projects.findFirst({
      where: and(eq(schema.projects.clientId, project.clientId), sql`lower(${schema.projects.name}) = lower(${input.name})`, ne(schema.projects.id, projectId)),
    });
    if (clash) throw new Error("This client already has a project with that name.");
    await db.update(schema.projects).set(input).where(eq(schema.projects.id, projectId));
    return undefined;
  });
}

/** Deletes a project that has no tasks. With tasks it asks to move them first. */
export async function deleteProject(projectId: number): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const [{ n }] = await db.select({ n: count() }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    if (n > 0) {
      throw new Error(
        `${n} ${n === 1 ? "task is" : "tasks are"} in this project (deleted ones count). Move them to another project first by editing each task.`,
      );
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    return undefined;
  });
}

export async function updateClient(clientId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = newClient.parse(Object.fromEntries(formData));
    if (input.kind === "company") {
      const [{ n }] = await db.select({ n: count() }).from(schema.clientCompanies).where(eq(schema.clientCompanies.clientId, clientId));
      if (n > 0) throw new Error("This client still lists companies. Remove them before making it a single company.");
    }
    await db
      .update(schema.clients)
      .set({
        name: input.name,
        kind: input.kind,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        hubstaffProjectId: input.hubstaffProjectId ?? null,
      })
      .where(eq(schema.clients.id, clientId));
    return undefined;
  });
}

/** Deletes a client that has no tasks, with its (empty) projects. A lead that became it returns to the pipeline. */
export async function deleteClient(clientId: number): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const rows = await db
      .select({ deletedAt: schema.tasks.deletedAt })
      .from(schema.tasks)
      .where(eq(schema.tasks.clientId, clientId));
    const live = rows.filter((r) => !r.deletedAt).length;
    if (live > 0) {
      throw new Error(`This client still has ${live} ${live === 1 ? "task" : "tasks"}. Delete or move them first.`);
    }
    if (rows.length > 0) {
      throw new Error(
        `This client has ${rows.length} deleted ${rows.length === 1 ? "task" : "tasks"}, which are kept so their tracked hours stay in reports. The client can't be removed while they exist.`,
      );
    }
    await db.transaction(async (tx) => {
      // A lead that became this client goes back to the pipeline.
      await tx
        .update(schema.leads)
        .set({ clientId: null, convertedAt: null, status: "proposal" })
        .where(eq(schema.leads.clientId, clientId));
      await tx.delete(schema.projects).where(eq(schema.projects.clientId, clientId));
      await tx.delete(schema.clientCompanies).where(eq(schema.clientCompanies.clientId, clientId));
      await tx.delete(schema.clients).where(eq(schema.clients.id, clientId));
    });
    return undefined;
  });
}

const companyFields = z.object({ name: z.string().trim().min(1, "Name is required").max(120), notes: optionalText });

/** Adds a company to a group client. */
export async function createCompany(clientId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = companyFields.parse(Object.fromEntries(formData));
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, clientId) });
    if (!client) throw new Error("Client not found");
    if (client.kind !== "group") throw new Error("Make this client a group of companies first.");
    const clash = await db.query.clientCompanies.findFirst({
      where: and(eq(schema.clientCompanies.clientId, clientId), sql`lower(${schema.clientCompanies.name}) = lower(${input.name})`),
    });
    if (clash) throw new Error("This group already has a company with that name.");
    await db.insert(schema.clientCompanies).values({ clientId, ...input });
    return undefined;
  });
}

export async function updateCompany(companyId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    const input = companyFields.parse(Object.fromEntries(formData));
    const company = await db.query.clientCompanies.findFirst({ where: eq(schema.clientCompanies.id, companyId) });
    if (!company) throw new Error("Company not found");
    const clash = await db.query.clientCompanies.findFirst({
      where: and(
        eq(schema.clientCompanies.clientId, company.clientId),
        sql`lower(${schema.clientCompanies.name}) = lower(${input.name})`,
        ne(schema.clientCompanies.id, companyId),
      ),
    });
    if (clash) throw new Error("This group already has a company with that name.");
    await db
      .update(schema.clientCompanies)
      .set({ name: input.name, notes: input.notes ?? null })
      .where(eq(schema.clientCompanies.id, companyId));
    return undefined;
  });
}

export async function deleteCompany(companyId: number): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin", "leader");
    await db.delete(schema.clientCompanies).where(eq(schema.clientCompanies.id, companyId));
    return undefined;
  });
}

/** Whole currency units. Accepts "1,500", "$1 500" or "1500.40"; empty means not set. */
const money = z.preprocess(
  (v) => {
    if (typeof v !== "string") return v;
    const cleaned = v.replace(/[\s,$€£]/g, "");
    return cleaned === "" ? undefined : Number(cleaned);
  },
  z
    .number({ error: "Expected monthly value must be a number" })
    .min(0, "Expected monthly value can't be negative")
    .transform(Math.round)
    .optional(),
);

const leadFields = {
  name: z.string().trim().min(1, "Name is required"),
  contactName: optionalText,
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  phone: optionalText,
  source: optionalText,
  notes: optionalText,
  ownerId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  expectedMonthlyValue: money,
};
const newLead = z.object(leadFields);
const editLead = z.object({
  ...leadFields,
  status: z.enum(["new", "contacted", "meeting", "proposal", "lost"]),
  lostReason: optionalText,
});

export async function createLead(_prev: unknown, formData: FormData): Promise<Result<{ id: number }>> {
  return run(async () => {
    await requireRole("super_admin");
    const input = newLead.parse(Object.fromEntries(formData));
    const [lead] = await db.insert(schema.leads).values(input).returning({ id: schema.leads.id });
    return lead;
  });
}

/** Saves the lead's details. Optional fields that were cleared are set back to empty. */
export async function updateLead(leadId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
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
    await requireRole("super_admin");
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
  return run(async () => {
    await requireRole("super_admin");
    return db.transaction(async (tx) => {
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
    });
  });
}

/** Deletes a lead that was never converted. Converted leads are kept as history. */
export async function deleteLead(leadId: number) {
  return run(async () => {
    await requireRole("super_admin");
    const lead = await db.query.leads.findFirst({ where: eq(schema.leads.id, leadId) });
    if (lead?.clientId) throw new Error("This lead became a client, so it is kept as history.");
    await db.delete(schema.leads).where(eq(schema.leads.id, leadId));
    return undefined;
  });
}

export async function startTask(taskId: number) {
  return run(async () => {
    await requireTask(taskId, "view");
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
    await requireTask(taskId, "view");
    await db
      .update(schema.tasks)
      .set({ status, doneAt: status === "done" ? new Date() : null })
      .where(eq(schema.tasks.id, taskId));
    // A repeating task creates its next copy when it is marked done.
    const next = status === "done" ? await spawnNextRepeat(taskId) : null;
    return { nextTaskId: next?.id ?? null, nextDueDate: next?.dueDate ?? null };
  });
}

/** Edits a task. If its name, client, due date or repeat changed, the Hubstaff task is renamed to match. */
export async function updateTask(
  taskId: number,
  _prev: unknown,
  formData: FormData,
): Promise<Result<{ hubstaffError?: string }>> {
  return run(async () => {
    const { auth, task } = await requireTask(taskId, "manage");
    if (task.deletedAt) throw new Error("This task was deleted. Restore it first.");
    const { projectId, projectName, projectKind, ...input } = newTask.parse(Object.fromEntries(formData));
    // Leaving the project blank keeps the current one while the client is the same.
    const keep = !projectId && !projectName && task.projectId && task.clientId === input.clientId;
    const project = keep ? { id: task.projectId! } : await pickProject(input.clientId, projectId, projectName, projectKind, input.title);
    const picked = input.assigneeId
      ? await db.query.users.findFirst({ where: eq(schema.users.id, input.assigneeId) })
      : null;
    if (auth.role === "leader" && picked && picked.teamId !== auth.ledTeam?.id) {
      throw new Error("You can only assign tasks to people in your team.");
    }
    const teamId = picked ? (picked.teamId ?? task.teamId) : task.teamId;
    if (input.repeat && !input.dueDate) throw new Error("A repeating task needs a due date");
    const repeatDay = input.repeat === "monthly" && input.dueDate ? Number(input.dueDate.slice(8, 10)) : null;
    const repeatShow = input.repeat ? (input.repeatShow ?? "days_before") : null;
    const repeatLeadDays = input.repeat && repeatShow === "days_before" ? (input.repeatLeadDays ?? defaultLeadDays(input.repeat)) : null;
    // A copy that is still waiting for its start date follows its due date when that changes.
    const today = localDay(new Date(), config.timeZone);
    const movedStart = task.startDate && input.dueDate && input.repeat && repeatShow ? showFrom(input.dueDate, repeatShow, repeatLeadDays, input.repeat) : null;
    await db
      .update(schema.tasks)
      .set({
        title: input.title,
        clientId: input.clientId,
        projectId: project.id,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        repeat: input.repeat ?? null,
        repeatDay,
        repeatLeadDays,
        repeatShow,
        teamId,
        ...(input.repeat && !task.seriesId ? { seriesId: task.id } : {}),
        ...(task.startDate ? { startDate: movedStart && movedStart > today ? movedStart : null } : {}),
      })
      .where(eq(schema.tasks.id, taskId));

    const changed =
      task.title !== input.title ||
      task.clientId !== input.clientId ||
      task.dueDate !== (input.dueDate ?? null) ||
      task.repeat !== (input.repeat ?? null);
    if (!task.hubstaffTaskId || !changed) return {};
    const client = await db.query.clients.findFirst({ where: eq(schema.clients.id, input.clientId) });
    const summary = hubstaffSummary(
      { id: task.id, title: input.title, repeat: input.repeat ?? null, dueDate: input.dueDate ?? null },
      client?.name,
    );
    return renameInHubstaff(task.hubstaffTaskId, () => summary);
  });
}

/** Stops a task from repeating (future copies only; existing ones are untouched). */
export async function stopRepeating(taskId: number) {
  return run(async () => {
    await requireTask(taskId, "manage");
    await db.update(schema.tasks).set({ repeat: null, repeatDay: null }).where(eq(schema.tasks.id, taskId));
    return undefined;
  });
}

/** Pulls older Hubstaff time for the range being reported, so reports can cover it. */
export async function loadHubstaffRange(from: string, to: string) {
  return run(async () => {
    await requireRole("super_admin", "leader");
    return backfillHubstaff(from, to);
  });
}

const member = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  hubstaffUserId: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
});

export async function addMember(_prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    // The very first person added becomes super admin; after that only a super admin adds people.
    const first = (await db.select({ id: schema.users.id }).from(schema.users).limit(1)).length === 0;
    if (!first) await requireRole("super_admin");
    await db
      .insert(schema.users)
      .values({ ...member.parse(Object.fromEntries(formData)), ...(first ? { role: "super_admin" as const } : {}) });
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

function memberIdsOf(formData: FormData): number[] {
  return [...new Set(formData.getAll("memberIds").map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Makes exactly these people the team's members (pulling them out of other teams); everyone else leaves it. */
async function setMembers(tx: Pick<typeof db, "update">, teamId: number, memberIds: number[], leaderId: number | null) {
  await tx.update(schema.users).set({ teamId: null }).where(
    memberIds.length ? and(eq(schema.users.teamId, teamId), notInArray(schema.users.id, memberIds)) : eq(schema.users.teamId, teamId),
  );
  if (memberIds.length) {
    await tx.update(schema.users).set({ teamId }).where(inArray(schema.users.id, memberIds));
    // Someone who led another team stops leading it once they move.
    await tx
      .update(schema.teams)
      .set({ leaderId: null })
      .where(and(inArray(schema.teams.leaderId, memberIds), ne(schema.teams.id, teamId)));
  }
  // The leader is always a member; a leader who was removed stops leading.
  const leaderStays = leaderId !== null && memberIds.includes(leaderId);
  await tx.update(schema.teams).set({ leaderId: leaderStays ? leaderId : null }).where(eq(schema.teams.id, teamId));
}

function teamNameError(e: unknown, name: string): never {
  if (String(e instanceof Error ? (e.cause ?? e) : e).includes("teams_name_unique")) {
    throw new Error(`A team called "${name}" already exists.`);
  }
  throw e;
}

export async function createTeam(_prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const input = newTeam.parse(Object.fromEntries(formData));
    const leaderId = input.leaderId ?? null;
    const memberIds = [...new Set([...memberIdsOf(formData), ...(leaderId ? [leaderId] : [])])];
    try {
      await db.transaction(async (tx) => {
        const [team] = await tx.insert(schema.teams).values({ name: input.name }).returning({ id: schema.teams.id });
        await setMembers(tx, team.id, memberIds, leaderId);
      });
    } catch (e) {
      teamNameError(e, input.name);
    }
    return undefined;
  });
}

/** Renames a team and sets its leader and its members in one go. */
export async function updateTeam(teamId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const input = newTeam.parse(Object.fromEntries(formData));
    const leaderId = input.leaderId ?? null;
    const memberIds = [...new Set([...memberIdsOf(formData), ...(leaderId ? [leaderId] : [])])];
    try {
      await db.transaction(async (tx) => {
        await tx.update(schema.teams).set({ name: input.name }).where(eq(schema.teams.id, teamId));
        await setMembers(tx, teamId, memberIds, leaderId);
      });
    } catch (e) {
      teamNameError(e, input.name);
    }
    return undefined;
  });
}

export async function setTeamLeader(teamId: number, leaderId: number | null) {
  return run(async () => {
    await requireRole("super_admin");
    await db.transaction((tx) => assignLeader(tx, teamId, leaderId));
    return undefined;
  });
}

/** Moves a person into a team, or out of any team with null. A leader who moves out stops leading. */
export async function setUserTeam(userId: number, teamId: number | null) {
  return run(async () => {
    await requireRole("super_admin");
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
    await requireRole("super_admin");
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ teamId: null }).where(eq(schema.users.teamId, teamId));
      await tx.update(schema.teams).set({ leaderId: null }).where(eq(schema.teams.id, teamId));
      await tx.delete(schema.teams).where(eq(schema.teams.id, teamId));
    });
    return undefined;
  });
}

export async function setHubstaffUserId(userId: number, formData: FormData) {
  await requireRole("super_admin");
  const raw = formData.get("hubstaffUserId");
  const hubstaffUserId = raw ? z.coerce.number().int().positive().parse(raw) : null;
  await db.update(schema.users).set({ hubstaffUserId }).where(eq(schema.users.id, userId));
  refresh();
}

const levels = z
  .object({
    approachingHours: z.coerce.number({ error: "Approaching must be a number of hours" }).int().min(1).max(24 * 90),
    criticalHours: z.coerce.number({ error: "Critical must be a number of hours" }).int().min(1).max(24 * 90),
  })
  .refine((v) => v.criticalHours < v.approachingHours, {
    message: "Critical must be fewer hours than Approaching",
  });

/** A team leader (or the super admin) sets when the team's tasks turn Approaching and Critical. */
export async function setTeamLevels(teamId: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    if (!canManageTeam(auth, teamId)) throw new Error("You don't have permission to do that.");
    const input = levels.parse(Object.fromEntries(formData));
    await db.update(schema.teams).set(input).where(eq(schema.teams.id, teamId));
    return undefined;
  });
}

/** Makes someone super admin, or back to a regular member. The last super admin can't be removed. */
export async function setUserRole(userId: number, role: "super_admin" | "member") {
  return run(async () => {
    await requireRole("super_admin");
    if (role === "member") {
      const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "super_admin"));
      if (admins.length <= 1 && admins[0]?.id === userId) throw new Error("There must be at least one super admin.");
    }
    await db.update(schema.users).set({ role }).where(eq(schema.users.id, userId));
    return undefined;
  });
}
