import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "./src/db";
const token = "idle-test-token-" + process.pid;
const id = createHash("sha256").update(token).digest("hex");
const [u] = await db.select().from(schema.users).limit(1);
const BASE = "http://localhost:3000/api/session";
const call = async (method: string) => {
  const r = await fetch(BASE, { method, headers: { cookie: `crm_session=${token}` } });
  return `${r.status} ${await r.text()}`;
};
const row = async () => (await db.select().from(schema.authSessions).where(eq(schema.authSessions.id, id)))[0];
try {
  await db.insert(schema.authSessions).values({ id, userId: u.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  console.log("now          ", new Date().toISOString());
  console.log("GET  (5m left)", await call("GET"));
  console.log("POST touch    ", await call("POST"));
  console.log("db expires_at ", (await row()).expiresAt.toISOString());
  console.log("no cookie GET ", `${(await fetch(BASE)).status}`);
  await db.update(schema.authSessions).set({ createdAt: sql`now() - interval '13 days 23 hours'` }).where(eq(schema.authSessions.id, id));
  console.log("POST near cap ", await call("POST"), "(should be capped ~1h ahead)");
  await db.update(schema.authSessions).set({ expiresAt: sql`now() - interval '1 second'`, createdAt: sql`now()` }).where(eq(schema.authSessions.id, id));
  console.log("GET  idle-expired ", await call("GET"));
  console.log("POST idle-expired ", await call("POST"));
  await db.update(schema.authSessions).set({ expiresAt: sql`now() + interval '1 hour'`, createdAt: sql`now() - interval '15 days'` }).where(eq(schema.authSessions.id, id));
  console.log("GET  over 14d ", await call("GET"));
  await db.update(schema.authSessions).set({ expiresAt: sql`now() + interval '1 hour'`, createdAt: sql`now()`, mfaPending: true }).where(eq(schema.authSessions.id, id));
  console.log("POST mfa pending", await call("POST"));
  const page = await fetch("http://localhost:3000/dashboard", { headers: { cookie: `crm_session=${token}` }, redirect: "manual" });
  console.log("dashboard w/ pending", page.status, page.headers.get("location"));
} finally {
  await db.delete(schema.authSessions).where(eq(schema.authSessions.id, id));
  process.exit(0);
}
