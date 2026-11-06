import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session-cookie";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Signs a person in: stores a session and sets its cookie. Replaces any session this browser already had. */
export async function createSession(userId: number) {
  await destroySession();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.authSessions).values({ id: hash(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** The person signed in with this browser's cookie, or null. */
export async function sessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id))
    .where(and(eq(schema.authSessions.id, hash(token)), gt(schema.authSessions.expiresAt, sql`now()`)));
  return row?.user ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(schema.authSessions).where(eq(schema.authSessions.id, hash(token)));
  jar.delete(SESSION_COOKIE);
}

/** An approved person: their email is on the Team page. Case doesn't matter. */
export async function findApprovedUser(email: string) {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  const users = await db.select().from(schema.users);
  return users.find((u) => u.email.toLowerCase() === wanted) ?? null;
}

/**
 * "google" once GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Until then, outside production,
 * "mock" shows a stand-in account chooser. In production without Google nobody can sign in.
 */
export function authMode(): "google" | "mock" | "none" {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "google";
  return process.env.NODE_ENV === "production" ? "none" : "mock";
}

/** The address Google sends people back to. Set APP_URL when the app is behind a proxy or on a real domain. */
export function googleRedirectUri(request: Request) {
  const base = process.env.APP_URL ?? new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/api/auth/callback/google`;
}
