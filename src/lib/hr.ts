import { and, asc, eq, inArray, ne, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Auth } from "@/lib/auth";

/** Whose requests this person decides on, as a filter on users; undefined for everyone (super admin). null: nobody. */
export function decidesFor(a: Auth): SQL | undefined | null {
  if (a.role === "super_admin") return undefined;
  if (a.role !== "leader" || !a.ledTeamIds.length) return null;
  return and(inArray(schema.users.teamId, a.ledTeamIds), ne(schema.users.id, a.user.id));
}

/** Requests waiting for this person's decision, oldest first. */
export async function waitingRequests(a: Auth) {
  const scope = decidesFor(a);
  if (scope === null) return [];
  return db
    .select({ request: schema.timeOff, person: { id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId } })
    .from(schema.timeOff)
    .innerJoin(schema.users, eq(schema.timeOff.userId, schema.users.id))
    .where(and(eq(schema.timeOff.status, "pending"), scope))
    .orderBy(asc(schema.timeOff.createdAt));
}

/** The people this person manages time off for (themselves not included). */
export async function managedPeople(a: Auth) {
  const scope = decidesFor(a);
  if (scope === null) return [];
  return db
    .select({ id: schema.users.id, name: schema.users.name, teamId: schema.users.teamId, annual: schema.users.annualLeaveDays })
    .from(schema.users)
    .where(scope)
    .orderBy(asc(schema.users.name));
}
