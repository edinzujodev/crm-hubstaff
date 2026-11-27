import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getAuth } from "@/lib/auth";

/**
 * The photo a person picked, to place it in the circle again: only for the person themselves. The square they cut
 * from it comes in the X-Photo-Crop header (JSON, in this image's pixels). Photos saved before originals were kept
 * send the saved square itself, without a crop.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/avatar/[id]/original">) {
  await connection();
  const auth = await getAuth();
  if (!auth) return new Response(null, { status: 401 });
  const id = Number((await ctx.params).id);
  if (id !== auth.user.id) return new Response(null, { status: 404 });
  const photo = await db.query.userPhotos.findFirst({ where: eq(schema.userPhotos.userId, id) });
  if (!photo) return new Response(null, { status: 404 });
  const headers: Record<string, string> = { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" };
  if (photo.original && photo.crop) headers["X-Photo-Crop"] = JSON.stringify(photo.crop);
  return new Response(Buffer.from(photo.original ?? photo.data, "base64"), { headers });
}
