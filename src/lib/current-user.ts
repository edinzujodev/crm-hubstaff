import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";

export const USER_COOKIE = "crm_user_id";

/**
 * MVP stand-in for authentication: the person picks who they are in the header.
 * Replace with real sign-in before this runs anywhere but a trusted network.
 */
export async function getCurrentUser() {
  const id = Number((await cookies()).get(USER_COOKIE)?.value);
  if (id) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
    if (user) return user;
  }
  return (await db.query.users.findFirst({ orderBy: asc(schema.users.id) })) ?? null;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Add a team member first (Team page).");
  return user;
}
