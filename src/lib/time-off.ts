import { and, count, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Auth } from "@/lib/auth";
import { ymd } from "@/lib/days";
import { daysOffBetween } from "@/lib/holidays";
import { countDays, workingDays, type TeamOff } from "@/lib/leave-days";

export * from "@/lib/leave-days";

/**
 * Who may approve or reject someone's request: a super admin anyone's; a team leader the people in the teams they
 * look after (their own team and the teams under it), but not their own request, which goes to the leader above.
 */
export function canDecide(a: Auth, person: { id: number; teamId: number | null }): boolean {
  if (a.role === "super_admin") return true;
  if (person.id === a.user.id) return false;
  return a.role === "leader" && person.teamId !== null && a.ledTeamIds.includes(person.teamId);
}

/** Whose time off a person may enter or see in full: their own, and everyone they approve for. */
export const canManagePerson = (a: Auth, person: { id: number; teamId: number | null }) =>
  person.id === a.user.id || canDecide(a, person);

/**
 * For a worker's request form: their team's time off from `from` to `to` (everyone else's, approved or waiting),
 * shown only as "off", never the kind. Undefined for leaders and super admins (they may go past the limit) and for
 * people without a team.
 */
export async function teamOffFor(auth: Auth, from: string, to: string): Promise<TeamOff | undefined> {
  const teamId = auth.user.teamId;
  if (auth.role !== "worker" || teamId === null) return undefined;
  const [team, [{ size }], off] = await Promise.all([
    db.query.teams.findFirst({ where: eq(schema.teams.id, teamId), columns: { name: true, maxOff: true } }),
    db.select({ size: count() }).from(schema.users).where(eq(schema.users.teamId, teamId)),
    db
      .select({ name: schema.users.name, startDate: schema.timeOff.startDate, endDate: schema.timeOff.endDate, status: schema.timeOff.status })
      .from(schema.timeOff)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeOff.userId))
      .where(
        and(
          eq(schema.users.teamId, teamId),
          ne(schema.timeOff.userId, auth.user.id),
          inArray(schema.timeOff.status, ["approved", "pending"]),
          lte(schema.timeOff.startDate, to),
          gte(schema.timeOff.endDate, from),
        ),
      ),
  ]);
  if (!team) return undefined;
  return { name: team.name, max: team.maxOff, size, off: off.map((o) => ({ name: o.name, startDate: o.startDate, endDate: o.endDate, pending: o.status === "pending" })) };
}

export type TeamLimitClash = { day: string; off: string[]; max: number; size: number; team: string };

/**
 * Checks a team's limit on how many of its people may be off at the same time. Everyone else's time off counts,
 * sick leave included; with `withPending`, so do requests still waiting (first come, first served). Returns the first
 * working day that is already full, or null when the time off fits (or the team has no limit).
 */
export async function teamLimitClash(
  person: { id: number; teamId: number | null },
  t: { startDate: string; endDate: string; halfDay: boolean },
  { withPending, ignoreId }: { withPending: boolean; ignoreId?: number },
): Promise<TeamLimitClash | null> {
  if (person.teamId === null) return null;
  const team = await db.query.teams.findFirst({ where: eq(schema.teams.id, person.teamId), columns: { name: true, maxOff: true } });
  if (!team || team.maxOff === null) return null;

  const [others, [{ size }], daysOff] = await Promise.all([
    db
      .select({ id: schema.timeOff.id, name: schema.users.name, startDate: schema.timeOff.startDate, endDate: schema.timeOff.endDate })
      .from(schema.timeOff)
      .innerJoin(schema.users, eq(schema.users.id, schema.timeOff.userId))
      .where(
        and(
          eq(schema.users.teamId, person.teamId),
          ne(schema.timeOff.userId, person.id),
          inArray(schema.timeOff.status, withPending ? ["approved", "pending"] : ["approved"]),
          lte(schema.timeOff.startDate, t.endDate),
          gte(schema.timeOff.endDate, t.startDate),
          ignoreId ? ne(schema.timeOff.id, ignoreId) : undefined,
        ),
      ),
    db.select({ size: count() }).from(schema.users).where(eq(schema.users.teamId, person.teamId)),
    daysOffBetween(t.startDate, t.endDate),
  ]);

  for (const day of workingDays(t, daysOff)) {
    const off = [...new Set(others.filter((o) => o.startDate <= day && o.endDate >= day).map((o) => o.name))];
    if (off.length >= team.maxOff) return { day, off, max: team.maxOff, size, team: team.name };
  }
  return null;
}

export type Balance = {
  year: number;
  /** This year's allowance. */
  allowance: number;
  /** Left over from last year. */
  carriedOver: number;
  /** What would carry over without a number set by hand. */
  carryWorkedOut: number;
  /** Carried-over days must be used by this day. */
  carryOverUntil: string;
  /** Approved vacation this year. */
  used: number;
  /** Carried-over days that expired unused. */
  expired: number;
  /** Vacation still waiting for approval this year. */
  pending: number;
  /** What can still be taken (not counting pending requests). */
  left: number;
  /** Whether the allowance or carry-over was set by hand for this year. */
  custom: { days: boolean; carriedOver: boolean };
};

/**
 * Vacation balances for a year. Each year the person gets their allowance plus whatever was left of last year's own
 * allowance. Carried-over days are used first and expire after `carryOverUntil` (30 June unless set). A super admin
 * can override the allowance or the carried-over days for a year (leave_allowances).
 */
export async function balancesFor(userIds: number[], year: number, today: string): Promise<Map<number, Balance>> {
  const out = new Map<number, Balance>();
  if (!userIds.length) return out;
  const [users, rows, vacation] = await Promise.all([
    db
      .select({ id: schema.users.id, annual: schema.users.annualLeaveDays })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds)),
    db.select().from(schema.leaveAllowances).where(inArray(schema.leaveAllowances.userId, userIds)),
    db
      .select()
      .from(schema.timeOff)
      .where(
        and(
          inArray(schema.timeOff.userId, userIds),
          eq(schema.timeOff.kind, "vacation"),
          inArray(schema.timeOff.status, ["approved", "pending"]),
          lte(schema.timeOff.startDate, ymd(year, 12, 31)),
        ),
      ),
  ]);

  // The first year anything is known for: before it nothing carries over.
  const known = [...rows.map((r) => r.year), ...vacation.map((v) => Number(v.startDate.slice(0, 4)))];
  const firstYear = Math.min(year, ...known);
  const daysOff = await daysOffBetween(ymd(firstYear, 1, 1), ymd(year, 12, 31));

  for (const u of users) {
    const mine = vacation.filter((v) => v.userId === u.id);
    let carry = 0;
    for (let y = firstYear; y <= year; y++) {
      const row = rows.find((r) => r.userId === u.id && r.year === y);
      const allowance = row?.days ?? u.annual;
      const workedOut = carry;
      const carriedOver = row?.carriedOver ?? workedOut;
      const until = row?.carryOverUntil ?? ymd(y, 6, 30);
      const [from, to] = [ymd(y, 1, 1), ymd(y, 12, 31)];

      // Approved days this year, and how many of them fell on or before the carry-over deadline.
      let used = 0;
      let early = 0;
      let pending = 0;
      for (const v of mine) {
        const n = countDays(v, daysOff, from, to);
        if (!n) continue;
        if (v.status === "pending") pending += n;
        else {
          used += n;
          early += countDays(v, daysOff, from, until < to ? until : to);
        }
      }
      const fromCarry = Math.min(carriedOver, early);
      const ownUsed = used - fromCarry;
      const expired = today > until ? carriedOver - fromCarry : 0;
      const left = allowance - ownUsed + (carriedOver - fromCarry - expired);
      carry = Math.max(0, allowance - ownUsed);
      if (y === year) {
        out.set(u.id, {
          year,
          allowance,
          carriedOver,
          carryWorkedOut: workedOut,
          carryOverUntil: until,
          used,
          expired,
          pending,
          left,
          custom: { days: row?.days != null, carriedOver: row?.carriedOver != null },
        });
      }
    }
  }
  return out;
}

export async function balanceFor(userId: number, year: number, today: string) {
  return (await balancesFor([userId], year, today)).get(userId)!;
}
