import { refresh } from "next/cache";
import { z } from "zod";

/** `canOverride`: the action refused with a warning that the person may go past by confirming (see OverridableError). */
export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string; canOverride?: boolean };

/** A refusal the signed-in person is allowed to go past: the form shows the warning with an "anyway" button. */
export class OverridableError extends Error {}

/** Runs a server action's work: refreshes the page on success, turns thrown errors into a message for the form. */
export async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof OverridableError) return { ok: false, error: e.message, canOverride: true };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues.map((i) => i.message).join(". ") };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
