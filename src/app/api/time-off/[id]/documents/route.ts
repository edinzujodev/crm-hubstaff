import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { getAuth } from "@/lib/auth";
import { settleSickNote } from "@/lib/notifications";
import { canManagePerson } from "@/lib/time-off";
import { cleanFileName, documentType, MAX_DOCUMENT_BYTES } from "@/lib/time-off-documents";

// A plain request rather than a server action: a scan of a sick note can be several MB, past a server action's 1 MB.

/**
 * Attaches a file ("file" in the form) to sick leave: a PDF, or a JPEG, PNG or WebP photo, up to 8 MB. The person
 * themselves can attach it, and so can whoever approves their time off. The "upload your sick note" reminder is then
 * marked as read.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/time-off/[id]/documents">) {
  await connection();
  const auth = await getAuth();
  if (!auth) return Response.json({ error: "You're signed out." }, { status: 401 });
  const id = Number((await ctx.params).id);
  const row = Number.isInteger(id) ? await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, id) }) : undefined;
  const person = row ? await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) }) : undefined;
  if (!row || !person || !canManagePerson(auth, person)) return Response.json({ error: "That time off isn't yours to add files to." }, { status: 404 });
  if (row.kind !== "sick") return Response.json({ error: "Files can only be added to sick leave." }, { status: 400 });
  if (row.status === "cancelled" || row.status === "rejected") return Response.json({ error: "This sick leave was withdrawn." }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Pick a file." }, { status: 400 });
  if (file.size > MAX_DOCUMENT_BYTES) return Response.json({ error: "That file is too big: 8 MB at most." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = documentType(bytes);
  if (!contentType) return Response.json({ error: "Attach a PDF or a photo (JPG, PNG or WebP)." }, { status: 400 });

  const [doc] = await db
    .insert(schema.timeOffDocuments)
    .values({ timeOffId: id, fileName: cleanFileName(file.name), contentType, size: bytes.length, data: bytes, uploadedById: auth.user.id })
    .returning({ id: schema.timeOffDocuments.id, fileName: schema.timeOffDocuments.fileName, size: schema.timeOffDocuments.size, contentType: schema.timeOffDocuments.contentType });
  await settleSickNote(id).catch((e) => console.error("Couldn't settle the sick note reminder:", e));
  return Response.json({ document: { ...doc, timeOffId: id } });
}
