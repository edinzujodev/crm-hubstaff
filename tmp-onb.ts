import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./src/db";
import { totpNow } from "./src/lib/totp";
const h = (t: string) => createHash("sha256").update(t).digest("hex");
async function main() {
  const cmd = process.argv[2];
  if (cmd === "setup") {
    const [u] = await db.insert(schema.users).values({ name: "Onboarding Tester", email: "tmp-onboard@example.test" }).returning();
    await db.insert(schema.authSessions).values({ id: h("tmp-onboard-token"), userId: u!.id, expiresAt: new Date(Date.now() + 3600e3) });
    console.log("user", u!.id);
  } else if (cmd === "code") {
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, "tmp-onboard@example.test") });
    console.log(totpNow(u!.totpSecret!));
  } else if (cmd === "pending") {
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, "tmp-onboard@example.test") });
    await db.delete(schema.authSessions).where(eq(schema.authSessions.userId, u!.id));
    await db.insert(schema.authSessions).values({ id: h("tmp-onboard-token"), userId: u!.id, expiresAt: new Date(Date.now() + 600e3), mfaPending: true });
    console.log("pending");
  } else if (cmd === "show") {
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, "tmp-onboard@example.test") });
    const s = await db.select().from(schema.authSessions).where(eq(schema.authSessions.userId, u!.id));
    console.log(JSON.stringify({ name: u!.name, phone: u!.phone, jobTitle: u!.jobTitle, startedOn: u!.startedOn, onboarded: !!u!.onboardedAt, totp: !!u!.totpEnabledAt, sessions: s.map((x) => ({ pending: x.mfaPending, fails: x.mfaFailures })) }));
  } else if (cmd === "cleanup") {
    const u = await db.query.users.findFirst({ where: eq(schema.users.email, "tmp-onboard@example.test") });
    if (u) { await db.delete(schema.authSessions).where(eq(schema.authSessions.userId, u.id)); await db.delete(schema.users).where(eq(schema.users.id, u.id)); }
    console.log("cleaned");
  }
  process.exit(0);
}
main();
