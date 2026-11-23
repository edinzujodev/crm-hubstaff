import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { SESSION_COOKIE, SESSION_DAYS } from "@/lib/session-cookie";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Signs a person in: stores a session and sets its cookie. Replaces any session this browser already had.
 * With `mfaPending` the session only lets them type their authenticator code (/login/verify); it counts as signed
 * in once the code is right. A pending session lasts 10 minutes.
 */
export async function createSession(userId: number, { mfaPending = false }: { mfaPending?: boolean } = {}) {
  await destroySession();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (mfaPending ? 10 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000));
  await db.insert(schema.authSessions).values({ id: hash(token), userId, expiresAt, mfaPending });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** The live session behind a cookie token and its person, pending or not. */
export async function sessionByToken(token: string) {
  const [row] = await db
    .select({ session: schema.authSessions, user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id))
    .where(and(eq(schema.authSessions.id, hash(token)), gt(schema.authSessions.expiresAt, sql`now()`)));
  return row ?? null;
}

async function cookieSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sessionByToken(token) : null;
}

/** The person signed in with this browser's cookie, or null. A session still waiting for its 2FA code doesn't count. */
export async function sessionUser() {
  const row = await cookieSession();
  return row && !row.session.mfaPending ? row.user : null;
}

/** The session waiting for its authenticator code, with its person, or null. */
export async function pendingSession() {
  const row = await cookieSession();
  return row?.session.mfaPending ? row : null;
}

/** The authenticator code was right: the pending session becomes a full one. */
export async function completePendingSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(schema.authSessions)
    .set({ mfaPending: false, mfaFailures: 0, expiresAt })
    .where(eq(schema.authSessions.id, hash(token)));
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** One more wrong authenticator code on a pending session. Returns how many wrong codes it has now. */
export async function countFailedCode(sessionId: string) {
  const [row] = await db
    .update(schema.authSessions)
    .set({ mfaFailures: sql`${schema.authSessions.mfaFailures} + 1` })
    .where(eq(schema.authSessions.id, sessionId))
    .returning({ failures: schema.authSessions.mfaFailures });
  return row?.failures ?? 0;
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
