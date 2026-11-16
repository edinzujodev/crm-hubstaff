import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { DEFAULT_LEVELS, type Levels } from "@/lib/urgency";

export const CRITICAL_KEY = "urgency_critical_hours";
export const APPROACHING_KEY = "urgency_approaching_hours";

/** The urgency levels every task is judged by, the same for all teams. Set by the super admin. */
export async function getLevels(): Promise<Levels> {
  const rows = await db
    .select()
    .from(schema.appState)
    .where(inArray(schema.appState.key, [CRITICAL_KEY, APPROACHING_KEY]));
  const get = (key: string, fallback: number) => {
    const n = Number(rows.find((r) => r.key === key)?.value);
    return Number.isInteger(n) && n >= 1 ? n : fallback;
  };
  return {
    criticalHours: get(CRITICAL_KEY, DEFAULT_LEVELS.criticalHours),
    approachingHours: get(APPROACHING_KEY, DEFAULT_LEVELS.approachingHours),
  };
}
