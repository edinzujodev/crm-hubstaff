import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getAuth } from "@/lib/auth";
import { canManagePerson } from "@/lib/time-off";

/**
 * Opens a file attached to time off, in the browser (or downloads it with ?download=1). Only for the person and those
 * who approve their time off; to anyone else it doesn't exist.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/time-off/documents/[docId]">) {
  await connection();
  const auth = await getAuth();
  if (!auth) return new Response(null, { status: 401 });
  const docId = Number((await ctx.params).docId);
  const doc = Number.isInteger(docId) ? await db.query.timeOffDocuments.findFirst({ where: eq(schema.timeOffDocuments.id, docId) }) : undefined;
  const row = doc ? await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, doc.timeOffId), columns: { userId: true } }) : undefined;
  const person = row ? await db.query.users.findFirst({ where: eq(schema.users.id, row.userId), columns: { id: true, teamId: true } }) : undefined;
  if (!doc || !person || !canManagePerson(auth, person)) return new Response(null, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Length": String(doc.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      // Shown as is: never run anything inside it.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
