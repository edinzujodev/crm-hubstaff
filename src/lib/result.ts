import { refresh } from "next/cache";
import { z } from "zod";

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a server action's work: refreshes the page on success, turns thrown errors into a message for the form. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(". ") };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
