import { asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/** The largest file a person can attach (the proxy buffers request bodies up to 10 MB, the form adds a little). */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/** A file attached to time off, without its bytes. */
export type TimeOffDocument = { id: number; timeOffId: number; fileName: string; size: number; contentType: string };

/** The files of these time off entries (oldest first), grouped by time off. */
export async function documentsFor(timeOffIds: number[]): Promise<Map<number, TimeOffDocument[]>> {
  const out = new Map<number, TimeOffDocument[]>();
  if (!timeOffIds.length) return out;
  const rows = await db
    .select({
      id: schema.timeOffDocuments.id,
      timeOffId: schema.timeOffDocuments.timeOffId,
      fileName: schema.timeOffDocuments.fileName,
      size: schema.timeOffDocuments.size,
      contentType: schema.timeOffDocuments.contentType,
    })
    .from(schema.timeOffDocuments)
    .where(inArray(schema.timeOffDocuments.timeOffId, timeOffIds))
    .orderBy(asc(schema.timeOffDocuments.createdAt));
  for (const r of rows) out.set(r.timeOffId, [...(out.get(r.timeOffId) ?? []), r]);
  return out;
}

/**
 * What kind of file these bytes are, by how the file starts (not by its name, which anyone can change): a PDF, or a
 * JPEG, PNG or WebP photo of the note. Anything else is refused.
 */
export function documentType(bytes: Uint8Array): string | null {
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

/** A file name safe to store and send back in a header: no path, no control characters, not too long. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim();
  return (clean || "document").slice(0, 120);
}
