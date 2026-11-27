import { isNotNull } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getAuth } from "@/lib/auth";

/** Who has a profile photo, as { userId: version }. The avatars read it once per page load (see components/avatar). */
export async function GET() {
  await connection();
  const auth = await getAuth();
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const rows = await db
    .select({ id: schema.users.id, version: schema.users.photoVersion })
    .from(schema.users)
    .where(isNotNull(schema.users.photoVersion));
  return Response.json(Object.fromEntries(rows.map((r) => [r.id, r.version])), { headers: { "Cache-Control": "no-store" } });
}
