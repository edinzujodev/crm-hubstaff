import { cache } from "react";
import { eq, or, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";

/**
 * super_admin: everything. leader: the person a team names as its leader; adds tasks and manages their team.
 * worker: everyone else; works on the tasks assigned to them.
 */
export type Role = "super_admin" | "leader" | "worker";

export type Auth = {
  user: schema.User;
  role: Role;
  /** The team this person leads, if any. */
  ledTeam: schema.Team | null;
};

/** Who is signed in and what they are. Cached for the duration of one request. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const ledTeam = (await db.query.teams.findFirst({ where: eq(schema.teams.leaderId, user.id) })) ?? null;
  const role: Role = user.role === "super_admin" ? "super_admin" : ledTeam ? "leader" : "worker";
  return { user, role, ledTeam };
});

export async function requireAuth(): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) throw new Error("Sign in first.");
  return auth;
}

/** For server actions: throws unless the signed-in person has one of the roles. */
export async function requireRole(...roles: Role[]): Promise<Auth> {
  const auth = await requireAuth();
  if (!roles.includes(auth.role)) throw new Error("You don't have permission to do that.");
  return auth;
}

/** For pages: sends people without one of the roles back to the task list. */
export async function pageGuard(...roles: Role[]): Promise<Auth> {
  const auth = await getAuth();
  if (!auth || !roles.includes(auth.role)) redirect("/");
  return auth;
}

type TaskScope = { assigneeId: number | null; teamId: number | null };

/** A worker sees their own tasks; a leader their team's (and their own); the super admin everything. */
export function canViewTask(a: Auth, t: TaskScope): boolean {
  if (a.role === "super_admin") return true;
  if (t.assigneeId === a.user.id) return true;
  return a.role === "leader" && t.teamId !== null && t.teamId === a.ledTeam?.id;
}

/** Editing, deleting, restoring and stopping the repeat of a task. */
export function canManageTask(a: Auth, t: TaskScope): boolean {
  if (a.role === "super_admin") return true;
  return a.role === "leader" && t.teamId !== null && t.teamId === a.ledTeam?.id;
}

/** SQL filter for the tasks a person may see; undefined means all. */
export function taskScope(a: Auth): SQL | undefined {
  if (a.role === "super_admin") return undefined;
  const own = eq(schema.tasks.assigneeId, a.user.id);
  if (a.role === "leader" && a.ledTeam) return or(own, eq(schema.tasks.teamId, a.ledTeam.id));
  return own;
}

/** For server actions on one task: loads it and checks the person may view or manage it. */
export async function requireTask(taskId: number, access: "view" | "manage") {
  const auth = await requireAuth();
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) });
  if (!task) throw new Error("Task not found");
  const allowed = access === "view" ? canViewTask(auth, task) : canManageTask(auth, task);
  if (!allowed) throw new Error("You don't have permission to do that.");
  return { auth, task };
}

/** Whether the team leader or super admin may change `teamId`'s settings. */
export function canManageTeam(a: Auth, teamId: number): boolean {
  return a.role === "super_admin" || (a.role === "leader" && a.ledTeam?.id === teamId);
}

/** Who a person may assign tasks to: a leader their own team, the super admin anyone. */
export async function assignableUsers(a: Auth) {
  const where = a.role === "super_admin" || !a.ledTeam ? undefined : eq(schema.users.teamId, a.ledTeam.id);
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(where).orderBy(schema.users.name);
}


/** The "You are" switcher is for local development only; it is off once Google sign-in is configured. */
export function devSwitcherEnabled(): boolean {
  return !process.env.GOOGLE_CLIENT_ID;
}
