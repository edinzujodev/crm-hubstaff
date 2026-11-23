import { connection } from "next/server";
import { sessionDeadline, touchSession } from "@/lib/session";

// Used by <IdleSignOut>. Plain requests rather than server actions so a background check never queues in front of a
// page navigation or refreshes the page.

/** When the session runs out if the person stays idle. 401 once it has. */
export async function GET() {
  await connection();
  const deadline = await sessionDeadline();
  if (!deadline) return Response.json({ error: "Signed out" }, { status: 401 });
  return Response.json({ expiresAt: deadline.toISOString() });
}

/** The person clicked, typed, scrolled or opened a page: restart their idle clock. 401 if already signed out. */
export async function POST() {
  await connection();
  const deadline = await touchSession();
  if (!deadline) return Response.json({ error: "Signed out" }, { status: 401 });
  return Response.json({ expiresAt: deadline.toISOString() });
}
