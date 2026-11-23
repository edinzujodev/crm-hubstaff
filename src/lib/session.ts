import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";
import { IDLE_MINUTES, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session-cookie";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

/**
 * How sessions end: `expires_at` is the idle deadline. Sign-in sets it IDLE_MINUTES ahead and every bit of activity
 * the open app reports (touchSession) pushes it forward again. Separately, no session outlives SESSION_DAYS from
 * `created_at`; the cookie expires then too.
 */
function setCookie(jar: Awaited<ReturnType<typeof cookies>>, token: string, expires: Date) {
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

/**
 * Signs a person in: stores a session and sets its cookie. Replaces any session this browser already had.
 * With `mfaPending` the session only lets them type their authenticator code (/login/verify); it counts as signed
 * in once the code is right. A pending session lasts 10 minutes.
 */
export async function createSession(userId: number, { mfaPending = false }: { mfaPending?: boolean } = {}) {
  await destroySession();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (mfaPending ? 10 * 60 * 1000 : IDLE_MS));
  await db.insert(schema.authSessions).values({ id: hash(token), userId, expiresAt, mfaPending });
  setCookie(await cookies(), token, mfaPending ? expiresAt : new Date(Date.now() + MAX_AGE_MS));
}

/** The live session behind a cookie token and its person, pending or not. */
export async function sessionByToken(token: string) {
  const [row] = await db
    .select({ session: schema.authSessions, user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.authSessions.id, hash(token)),
        gt(schema.authSessions.expiresAt, sql`now()`),
        // The clock is the database's: reading Date.now() here would break prerendering of the pages that call this.
        gt(schema.authSessions.createdAt, sql`now() - ${`${SESSION_DAYS} days`}::interval`),
      ),
    );
  return row ?? null;
}

/**
 * The person is using the app: pushes this browser's idle deadline IDLE_MINUTES ahead (never past the session's
 * SESSION_DAYS limit). Returns the new deadline, or null when there is no live, fully signed-in session.
 */
export async function touchSession(): Promise<Date | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const now = Date.now();
  const [row] = await db
    .update(schema.authSessions)
    .set({
      expiresAt: sql`least(${new Date(now + IDLE_MS)}::timestamptz, ${schema.authSessions.createdAt} + ${`${SESSION_DAYS} days`}::interval)`,
    })
    .where(
      and(
        eq(schema.authSessions.id, hash(token)),
        eq(schema.authSessions.mfaPending, false),
        gt(schema.authSessions.expiresAt, sql`now()`),
        gt(schema.authSessions.createdAt, new Date(now - MAX_AGE_MS)),
      ),
    )
    .returning({ expiresAt: schema.authSessions.expiresAt });
  return row?.expiresAt ?? null;
}

/** When this browser's session runs out if nothing else happens, or null if it already has. Changes nothing. */
export async function sessionDeadline(): Promise<Date | null> {
  const row = await cookieSession();
  return row && !row.session.mfaPending ? row.session.expiresAt : null;
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
  await db
    .update(schema.authSessions)
    .set({ mfaPending: false, mfaFailures: 0, expiresAt: new Date(Date.now() + IDLE_MS) })
    .where(eq(schema.authSessions.id, hash(token)));
  setCookie(jar, token, new Date(Date.now() + MAX_AGE_MS));
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

/** Two-step verification or the first-sign-in details are still missing: the person belongs on /welcome. */
export function needsSetup(user: { onboardedAt: Date | null; totpEnabledAt: Date | null }) {
  return !user.onboardedAt || !user.totpEnabledAt;
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
