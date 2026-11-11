import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

import type { ProjectKind } from "@/lib/project-kind";

/**
 * The client's project with this name (any capitalisation), created when it doesn't exist yet.
 * A blank name falls back to `fallback` (the task title), so a project can be left to autopopulate.
 */
export async function resolveProject(clientId: number, name: string | undefined, kind: ProjectKind | undefined, fallback: string) {
  const wanted = (name?.trim() || fallback.trim()).slice(0, 120);
  const existing = await db.query.projects.findFirst({
    where: and(eq(schema.projects.clientId, clientId), sql`lower(${schema.projects.name}) = lower(${wanted})`),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(schema.projects)
    .values({ clientId, name: wanted, kind: kind ?? "one_off" })
    .onConflictDoNothing()
    .returning();
  // A parallel request may have created it first.
  if (created) return created;
  const again = await db.query.projects.findFirst({
    where: and(eq(schema.projects.clientId, clientId), eq(schema.projects.name, wanted)),
  });
  if (!again) throw new Error("Could not create the project");
  return again;
}
