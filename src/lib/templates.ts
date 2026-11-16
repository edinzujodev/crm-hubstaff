import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

export type TemplateOption = { id: number; name: string; description: string | null; items: string[] };

/** Every template with its checklist items in order. */
export async function listTemplates(): Promise<TemplateOption[]> {
  const [templates, items] = await Promise.all([
    db.select().from(schema.checklistTemplates).orderBy(asc(schema.checklistTemplates.name)),
    db
      .select()
      .from(schema.checklistTemplateItems)
      .orderBy(asc(schema.checklistTemplateItems.position), asc(schema.checklistTemplateItems.id)),
  ]);
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    items: items.filter((i) => i.templateId === t.id).map((i) => i.text),
  }));
}
