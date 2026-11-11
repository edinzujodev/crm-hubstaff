"use server";

import { and, count, eq, min } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAuth } from "@/lib/auth";
import { LAYOUTS, LAYOUT_KEYS, isWidgetType, validateConfig, type AnyConfig, type Layout, type WidgetType } from "@/lib/dashboard/config";
import { insertStarter } from "@/lib/dashboard/data";
import { assertAllowed } from "@/lib/dashboard/scope";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const MAX_WIDGETS = 30;

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(". ") };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const titleSchema = z
  .string()
  .trim()
  .max(80, "Keep the title under 80 characters")
  .nullish()
  .transform((v) => v || null);

/** Loads one of the signed-in person's own widgets; dashboards are personal, nobody edits another's. */
async function ownWidget(widgetId: number) {
  const auth = await requireAuth();
  const widget = await db.query.dashboardWidgets.findFirst({
    where: and(eq(schema.dashboardWidgets.id, widgetId), eq(schema.dashboardWidgets.userId, auth.user.id)),
  });
  if (!widget) throw new Error("Widget not found");
  if (!isWidgetType(widget.type)) throw new Error("Unknown widget type");
  return { auth, widget, type: widget.type as WidgetType };
}

export async function addWidget(input: {
  type: string;
  config: AnyConfig;
  title?: string | null;
}): Promise<Result<{ id: number }>> {
  return run(async () => {
    const auth = await requireAuth();
    if (!isWidgetType(input.type)) throw new Error("Unknown widget type");
    const config = validateConfig(input.type, input.config);
    await assertAllowed(auth, input.type, config);
    const title = titleSchema.parse(input.title);
    const [{ n }] = await db
      .select({ n: count() })
      .from(schema.dashboardWidgets)
      .where(eq(schema.dashboardWidgets.userId, auth.user.id));
    if (n >= MAX_WIDGETS) throw new Error(`A dashboard holds up to ${MAX_WIDGETS} widgets. Remove one first.`);
    // New widgets go on top, so the person sees straight away that it was added.
    const [{ first }] = await db
      .select({ first: min(schema.dashboardWidgets.position) })
      .from(schema.dashboardWidgets)
      .where(eq(schema.dashboardWidgets.userId, auth.user.id));
    const [row] = await db
      .insert(schema.dashboardWidgets)
      .values({ userId: auth.user.id, type: input.type, config, title, columnIndex: 0, position: (first ?? 1) - 1 })
      .returning({ id: schema.dashboardWidgets.id });
    return { id: row.id };
  });
}

export async function updateWidget(widgetId: number, input: { config: AnyConfig; title?: string | null }) {
  return run(async () => {
    const { auth, widget, type } = await ownWidget(widgetId);
    const config = validateConfig(type, input.config);
    await assertAllowed(auth, type, config);
    const title = titleSchema.parse(input.title);
    await db.update(schema.dashboardWidgets).set({ config, title }).where(eq(schema.dashboardWidgets.id, widget.id));
  });
}

export async function removeWidget(widgetId: number) {
  return run(async () => {
    const { widget } = await ownWidget(widgetId);
    await db.delete(schema.dashboardWidgets).where(eq(schema.dashboardWidgets.id, widget.id));
  });
}

/** The dashboard's column layout and, per column, the widget ids from top to bottom. */
export async function saveLayout(layout: Layout, columns: number[][]) {
  return run(async () => {
    const auth = await requireAuth();
    if (!LAYOUT_KEYS.includes(layout)) throw new Error("Unknown layout");
    const cols = z.array(z.array(z.number().int().positive()).max(MAX_WIDGETS)).max(LAYOUTS[layout].count).parse(columns);
    await db.transaction(async (tx) => {
      await tx.update(schema.users).set({ dashboardLayout: layout }).where(eq(schema.users.id, auth.user.id));
      for (const [columnIndex, ids] of cols.entries()) {
        for (const [position, id] of ids.entries()) {
          await tx
            .update(schema.dashboardWidgets)
            .set({ columnIndex, position })
            .where(and(eq(schema.dashboardWidgets.id, id), eq(schema.dashboardWidgets.userId, auth.user.id)));
        }
      }
    });
  });
}

/** Throws away the person's layout and puts back the starter one for their role. */
export async function resetDashboard() {
  return run(async () => {
    const auth = await requireAuth();
    await db.transaction(async (tx) => {
      await tx.delete(schema.dashboardWidgets).where(eq(schema.dashboardWidgets.userId, auth.user.id));
      await tx.update(schema.users).set({ dashboardLayout: "2" }).where(eq(schema.users.id, auth.user.id));
    });
    await insertStarter(auth);
  });
}
