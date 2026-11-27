import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getAuth } from "@/lib/auth";

/**
 * A person's profile photo. Its URL carries the photo's version (?v=), so the browser may keep it for good: a new
 * photo gets a new URL.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[id]">) {
  await connection();
  const auth = await getAuth();
  if (!auth) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response(null, { status: 404 });
  const photo = await db.query.userPhotos.findFirst({ where: eq(schema.userPhotos.userId, id) });
  if (!photo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(photo.data, "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
