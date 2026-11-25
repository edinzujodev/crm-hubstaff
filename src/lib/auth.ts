import { cache } from "react";
import { eq, inArray, or, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/current-user";
import { needsSetup } from "@/lib/session";

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
  /**
   * The teams whose tasks they look after: the one they lead plus every team that reports to it, so a leader of
   * team leaders also covers those leaders' teams. Empty for people who lead nothing.
   */
  ledTeamIds: number[];
};

/** The team plus every team below it (teams whose parent is it, and so on). */
async function teamsUnder(teamId: number): Promise<number[]> {
  const all = await db.select({ id: schema.teams.id, parentTeamId: schema.teams.parentTeamId }).from(schema.teams);
  const ids = [teamId];
  for (let i = 0; i < ids.length; i++) {
    for (const t of all) if (t.parentTeamId === ids[i] && !ids.includes(t.id)) ids.push(t.id);
  }
  return ids;
}

/** Who is signed in and what they are. Cached for the duration of one request. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const ledTeam = (await db.query.teams.findFirst({ where: eq(schema.teams.leaderId, user.id) })) ?? null;
  const role: Role = user.role === "super_admin" ? "super_admin" : ledTeam ? "leader" : "worker";
  return { user, role, ledTeam, ledTeamIds: ledTeam ? await teamsUnder(ledTeam.id) : [] };
});

/** The HR section (calendar, vacations, holidays, people, teams) is for super admins and team leaders only. */
export const HR_ROLES: Role[] = ["super_admin", "leader"];
export const canUseHr = (a: Auth) => HR_ROLES.includes(a.role);

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

/**
 * For pages: signed out goes to /login, an unfinished setup to /welcome, and people without one of the roles (when
 * any are given) back to the dashboard. The proxy does the same routing, but it doesn't run when a server action
 * redirects or refreshes, so pages check it themselves too.
 */
export async function pageGuard(...roles: Role[]): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (needsSetup(auth.user)) redirect("/welcome");
  if (roles.length && !roles.includes(auth.role)) redirect("/");
  return auth;
}

type TaskScope = { assigneeId: number | null; teamId: number | null; reviewerId?: number | null };

/** A worker sees their own tasks; a leader their team's (and their own); the super admin everything. */
export function canViewTask(a: Auth, t: TaskScope): boolean {
  if (a.role === "super_admin") return true;
  if (t.assigneeId === a.user.id || t.reviewerId === a.user.id) return true;
  return a.role === "leader" && t.teamId !== null && a.ledTeamIds.includes(t.teamId);
}

/** Editing, deleting, restoring and stopping the repeat of a task. */
export function canManageTask(a: Auth, t: TaskScope): boolean {
  if (a.role === "super_admin") return true;
  return a.role === "leader" && t.teamId !== null && a.ledTeamIds.includes(t.teamId);
}

/** SQL filter for the tasks a person may see; undefined means all. */
export function taskScope(a: Auth): SQL | undefined {
  if (a.role === "super_admin") return undefined;
  // Tasks sent to you for review are yours to see too.
  const own = or(eq(schema.tasks.assigneeId, a.user.id), eq(schema.tasks.reviewerId, a.user.id));
  if (a.role === "leader" && a.ledTeamIds.length) return or(own, inArray(schema.tasks.teamId, a.ledTeamIds));
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

/** Who a person may assign tasks to: a leader their team (and the teams under it), the super admin anyone. */
export async function assignableUsers(a: Auth) {
  const where = a.role === "super_admin" || !a.ledTeamIds.length ? undefined : inArray(schema.users.teamId, a.ledTeamIds);
  return db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(where).orderBy(schema.users.name);
}
