"use server";

import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { canUseHr, requireAuth, requireRole, type Auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtDays, fmtRange, fmtShortDay, isDay, weekday } from "@/lib/days";
import { REPEATS } from "@/lib/recurrence";
import { localDay } from "@/lib/format";
import {
  notifySickNoteNeeded,
  notifyTimeOffAdded,
  notifyTimeOffCancelled,
  notifyTimeOffChanged,
  notifyTimeOffDecided,
  settleSickNote,
} from "@/lib/notifications";
import { blockedBetween, builtInHolidays, daysOffBetween } from "@/lib/holidays";
import { OverridableError, run, type Result } from "@/lib/result";
import { balanceFor, blockable, blockedClash, canDecide, canManagePerson, countDays, KIND_LABEL, needsApproval, teamLimitClash } from "@/lib/time-off";

const today = () => localDay(new Date(), config.timeZone);

/** Notifications are a courtesy: if sending one fails, the change itself still stands. */
async function quietly(send: () => Promise<void>) {
  try {
    await send();
  } catch (e) {
    console.error("Couldn't send the notification:", e);
  }
}

const day = (what: string) => z.string().refine(isDay, `Pick ${what}`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .optional()
    .transform((v) => v || null);

/** Refuses planned time off on blocked days. A super admin sets the blocks, so they can still enter it. */
async function checkNotBlocked(auth: Auth, t: { kind: (typeof schema.timeOffKind.enumValues)[number]; startDate: string; endDate: string }) {
  if (!blockable(t.kind) || auth.role === "super_admin") return;
  const clash = blockedClash(t, await blockedBetween(t.startDate, t.endDate));
  if (clash) throw new Error(`Nobody can take time off ${fmtRange(clash.startDate, clash.endDate)}: ${clash.reason}.`);
}

/**
 * Refuses planned time off on a day when the team already has as many people off as it allows. Sick leave is never
 * refused. Super admins and team leaders are only warned: they may go past the limit by confirming (`override`).
 */
async function checkTeamLimit(
  auth: Auth,
  person: { id: number; name: string; teamId: number | null },
  t: { kind: (typeof schema.timeOffKind.enumValues)[number]; startDate: string; endDate: string; halfDay: boolean },
  opts: { withPending: boolean; ignoreId?: number; override?: boolean },
) {
  const mayOverride = canUseHr(auth);
  if (!blockable(t.kind) || (mayOverride && opts.override)) return;
  const clash = await teamLimitClash(person, t, opts);
  if (!clash) return;
  const names = clash.off.join(", ");
  const message = `${clash.team} allows ${clash.max} of ${clash.size} people off at the same time, and ${fmtShortDay(clash.day)} already has ${clash.off.length} (${names})${opts.withPending ? " off or waiting for approval" : " off"}.`;
  throw mayOverride ? new OverridableError(message) : new Error(message);
}

async function personFor(auth: Auth, userId: number) {
  const person = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!person) throw new Error("That person no longer exists.");
  if (!canManagePerson(auth, person)) throw new Error("You can't enter time off for this person.");
  return person;
}

// ---- Time off -------------------------------------------------------------------------------------------------

const timeOffInput = z
  .object({
    userId: z.coerce.number().int().positive().optional(),
    kind: z.enum(schema.timeOffKind.enumValues, { error: "Pick what kind of time off it is" }),
    startDate: day("the first day"),
    endDate: day("the last day"),
    halfDay: z
      .string()
      .optional()
      .transform((v) => v === "on"),
    note: optionalText(500),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "The last day can't be before the first day" })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { message: "A half day can only be a single day" });

/**
 * Time off for yourself, or (as their team lead or a super admin) for someone else. Sick leave counts right away, and
 * so does anything an approver enters for someone, and a team lead's or super admin's own time off; a worker's
 * other requests wait for approval.
 */
export async function requestTimeOff(_prev: unknown, formData: FormData): Promise<Result<{ status: string }>> {
  return run(async () => {
    const auth = await requireAuth();
    const input = timeOffInput.parse(Object.fromEntries(formData));
    const person = await personFor(auth, input.userId ?? auth.user.id);
    const forSomeoneElse = person.id !== auth.user.id;

    await checkNotBlocked(auth, input);
    await checkTeamLimit(auth, person, input, { withPending: true, override: formData.get("overrideLimit") === "on" });

    const daysOff = await daysOffBetween(input.startDate, input.endDate);
    const days = countDays(input, daysOff);
    if (!days) throw new Error("Those dates are only weekends or public holidays, so there's nothing to take off.");

    const clash = await db.query.timeOff.findFirst({
      where: and(
        eq(schema.timeOff.userId, person.id),
        inArray(schema.timeOff.status, ["pending", "approved"]),
        lte(schema.timeOff.startDate, input.endDate),
        gte(schema.timeOff.endDate, input.startDate),
      ),
    });
    if (clash) {
      throw new Error(
        `${forSomeoneElse ? `${person.name} already has` : "You already have"} ${KIND_LABEL[clash.kind].toLowerCase()} on some of these days.`,
      );
    }

    // Vacation can't go past what is left this year (a super admin can still enter it).
    if (input.kind === "vacation" && auth.role !== "super_admin") {
      for (let y = Number(input.startDate.slice(0, 4)); y <= Number(input.endDate.slice(0, 4)); y++) {
        const b = await balanceFor(person.id, y, today());
        const wanted = countDays(input, daysOff, `${y}-01-01`, `${y}-12-31`);
        if (wanted > b.left - b.pending) {
          throw new Error(
            `That's ${fmtDays(wanted)} of vacation in ${y}, but you only have ${fmtDays(Math.max(0, b.left - b.pending))} left${b.pending ? " after the requests still waiting" : ""}.`,
          );
        }
      }
    }

    const approvedNow =
      !needsApproval(input.kind) || (forSomeoneElse && canDecide(auth, person)) || auth.role === "super_admin" || (!forSomeoneElse && auth.role === "leader");
    const [row] = await db.insert(schema.timeOff).values({
      userId: person.id,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDay: input.halfDay,
      note: input.note,
      status: approvedNow ? "approved" : "pending",
      createdById: auth.user.id,
      ...(approvedNow && needsApproval(input.kind) ? { decidedById: auth.user.id, decidedAt: new Date() } : {}),
    }).returning({ id: schema.timeOff.id });
    await quietly(() => notifyTimeOffAdded(auth.user, person, { ...input, id: row!.id }, approvedNow));
    if (input.kind === "sick") await quietly(() => notifySickNoteNeeded(auth.user, person, { ...input, id: row!.id }));
    return { status: approvedNow ? "approved" : "pending" };
  });
}

/**
 * Change the kind, dates or note of time off, as someone who approves for the person (a super admin: anyone's). The
 * same checks as a new request apply; the person is told what changed.
 */
export async function updateTimeOff(id: number, _prev: unknown, formData: FormData): Promise<Result<{ status: string }>> {
  return run(async () => {
    const auth = await requireAuth();
    const row = await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, id) });
    if (!row) throw new Error("That time off no longer exists.");
    if (row.status === "rejected" || row.status === "cancelled") throw new Error("It's no longer on the calendar, so it can't be changed.");
    const person = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
    if (!person || !canDecide(auth, person)) throw new Error("You can't change this time off.");
    const input = timeOffInput.parse(Object.fromEntries(formData));
    const unchanged =
      input.kind === row.kind && input.startDate === row.startDate && input.endDate === row.endDate && input.halfDay === row.halfDay && input.note === row.note;
    if (unchanged) return { status: row.status };

    await checkNotBlocked(auth, input);
    await checkTeamLimit(auth, person, input, { withPending: true, ignoreId: id, override: formData.get("overrideLimit") === "on" });

    const daysOff = await daysOffBetween(input.startDate < row.startDate ? input.startDate : row.startDate, input.endDate > row.endDate ? input.endDate : row.endDate);
    if (!countDays(input, daysOff)) throw new Error("Those dates are only weekends or public holidays, so there's nothing to take off.");

    const clash = await db.query.timeOff.findFirst({
      where: and(
        eq(schema.timeOff.userId, person.id),
        ne(schema.timeOff.id, id),
        inArray(schema.timeOff.status, ["pending", "approved"]),
        lte(schema.timeOff.startDate, input.endDate),
        gte(schema.timeOff.endDate, input.startDate),
      ),
    });
    if (clash) throw new Error(`${person.name} already has ${KIND_LABEL[clash.kind].toLowerCase()} on some of these days.`);

    // Vacation can't go past what is left, counting the days this time off already takes (a super admin can still enter it).
    if (input.kind === "vacation" && auth.role !== "super_admin") {
      for (let y = Number(input.startDate.slice(0, 4)); y <= Number(input.endDate.slice(0, 4)); y++) {
        const [from, to] = [`${y}-01-01`, `${y}-12-31`];
        const b = await balanceFor(person.id, y, today());
        const already = row.kind === "vacation" ? countDays(row, daysOff, from, to) : 0;
        const free = b.left - b.pending + already;
        const wanted = countDays(input, daysOff, from, to);
        if (wanted > free) throw new Error(`That's ${fmtDays(wanted)} of vacation in ${y}, but ${person.name} only has ${fmtDays(Math.max(0, free))} left.`);
      }
    }

    // Sick leave counts straight away; otherwise it keeps its status (a waiting request still waits).
    const status = needsApproval(input.kind) ? row.status : "approved";
    const after = { kind: input.kind, startDate: input.startDate, endDate: input.endDate, halfDay: input.halfDay, note: input.note, status };
    await db.update(schema.timeOff).set(after).where(eq(schema.timeOff.id, id));
    await quietly(() => notifyTimeOffChanged(auth.user, person, row, { id, ...after }));
    // Changed into sick leave: a sick note is needed (unless one is attached already). Changed away from it: not any more.
    if (after.kind === "sick" && row.kind !== "sick") {
      const attached = await db.query.timeOffDocuments.findFirst({ where: eq(schema.timeOffDocuments.timeOffId, id), columns: { id: true } });
      if (!attached) await quietly(() => notifySickNoteNeeded(auth.user, person, { id, ...after }));
    } else if (after.kind !== "sick" && row.kind === "sick") {
      await quietly(() => settleSickNote(id));
    }
    return { status };
  });
}

/** Approve or reject a request that is waiting. */
export async function decideTimeOff(id: number, approve: boolean, note?: string, overrideLimit = false): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const row = await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, id) });
    if (!row) throw new Error("That request no longer exists.");
    if (row.status !== "pending") throw new Error("That request has already been decided.");
    const person = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
    if (!person || !canDecide(auth, person)) throw new Error("You can't decide on this request.");
    const decisionNote = z.string().trim().max(500).optional().parse(note) || null;
    if (!approve && !decisionNote) throw new Error("Say why it's rejected, so they know.");
    // Blocked after it was asked for: a team leader can only reject it now.
    if (approve) {
      await checkNotBlocked(auth, row);
      await checkTeamLimit(auth, person, row, { withPending: false, ignoreId: row.id, override: overrideLimit });
    }
    const changed = await db
      .update(schema.timeOff)
      .set({ status: approve ? "approved" : "rejected", decidedById: auth.user.id, decidedAt: new Date(), decisionNote })
      .where(and(eq(schema.timeOff.id, id), eq(schema.timeOff.status, "pending")))
      .returning({ id: schema.timeOff.id });
    // Someone else decided it a moment earlier: they have told the person already.
    if (!changed.length) throw new Error("That request has already been decided.");
    await quietly(() => notifyTimeOffDecided(auth.user, person, row, approve, decisionNote));
    return undefined;
  });
}

/**
 * Take time off back. People withdraw their own requests, and approved time off that hasn't started yet; approvers
 * revoke anything of the people they approve for. Time off that is already over stays as it is, for everyone.
 */
export async function cancelTimeOff(id: number): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const row = await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, id) });
    if (!row) throw new Error("That time off no longer exists.");
    if (row.status === "rejected" || row.status === "cancelled") throw new Error("It's already off the calendar.");
    if (row.endDate < today()) throw new Error("This time off is already over, so it can't be taken back.");
    const person = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
    if (!person) throw new Error("That person no longer exists.");
    const own = row.userId === auth.user.id;
    const allowed =
      canDecide(auth, person) || (own && (row.status === "pending" || row.kind === "sick" || row.startDate > today()));
    if (!allowed) throw new Error("Time off that has already started can only be withdrawn by your team lead.");
    await db
      .update(schema.timeOff)
      .set({ status: "cancelled", cancelledById: auth.user.id, cancelledAt: new Date() })
      .where(eq(schema.timeOff.id, id));
    await quietly(() => notifyTimeOffCancelled(auth.user, person, row));
    await quietly(() => settleSickNote(id));
    return undefined;
  });
}

// ---- Allowances -----------------------------------------------------------------------------------------------

const optionalDays = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v.replace(",", ".")) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 365 && Number.isInteger(v * 2)), "Days must be a number like 20 or 20.5");

const allowanceInput = z.object({
  annual: optionalDays,
  days: optionalDays,
  carriedOver: optionalDays,
  carryOverUntil: z
    .string()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || isDay(v), "Pick the day carried-over days expire"),
});

/**
 * A super admin (anyone's) or team lead (the people in the teams they lead, not their own) sets a person's vacation
 * days: the default per year, and for one year the allowance and the days carried over from last year. An empty year
 * field goes back to the default.
 */
export async function setAllowance(userId: number, year: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    const auth = await requireRole("super_admin", "leader");
    const person = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { id: true, teamId: true } });
    if (!person || !canDecide(auth, person)) throw new Error("You can only change the vacation days of people in the teams you lead.");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Pick a year.");
    const input = allowanceInput.parse(Object.fromEntries(formData));
    if (input.annual !== null) await db.update(schema.users).set({ annualLeaveDays: input.annual }).where(eq(schema.users.id, userId));
    const values = { days: input.days, carriedOver: input.carriedOver, carryOverUntil: input.carryOverUntil };
    if (Object.values(values).every((v) => v === null)) {
      await db
        .delete(schema.leaveAllowances)
        .where(and(eq(schema.leaveAllowances.userId, userId), eq(schema.leaveAllowances.year, year)));
    } else {
      await db
        .insert(schema.leaveAllowances)
        .values({ userId, year, ...values })
        .onConflictDoUpdate({
          target: [schema.leaveAllowances.userId, schema.leaveAllowances.year],
          set: { ...values, updatedAt: new Date() },
        });
    }
    return undefined;
  });
}

// ---- Holidays -------------------------------------------------------------------------------------------------

const holidayInput = z.object({
  date: day("the date"),
  name: z.string().trim().min(1, "Give the holiday a name").max(120),
  dayOff: z
    .string()
    .optional()
    .transform((v) => v === "on"),
});

export async function addHoliday(_prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const input = holidayInput.parse(Object.fromEntries(formData));
    await db.insert(schema.holidays).values({ ...input, source: "custom" });
    return undefined;
  });
}

export type HolidayTarget = { kind: "custom"; id: number } | { kind: "built-in"; date: string; name: string };

/**
 * Changes a holiday. A custom one is updated; a built-in one can't be changed in place, so it is hidden for that
 * date and the changed copy is added as a custom holiday (e.g. Bajram moved to the day that was announced).
 */
export async function updateHoliday(target: HolidayTarget, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const input = holidayInput.parse(Object.fromEntries(formData));
    if (target.kind === "custom") {
      const [row] = await db
        .update(schema.holidays)
        .set(input)
        .where(and(eq(schema.holidays.id, target.id), eq(schema.holidays.source, "custom")))
        .returning({ id: schema.holidays.id });
      if (!row) throw new Error("That holiday no longer exists.");
      return undefined;
    }
    const known =
      isDay(target.date) && builtInHolidays(Number(target.date.slice(0, 4))).some((h) => h.date === target.date && h.name === target.name);
    if (!known) throw new Error("That isn't a built-in holiday.");
    await db.transaction(async (tx) => {
      await tx.insert(schema.holidays).values({ date: target.date, name: target.name, dayOff: false, source: "hidden" });
      await tx.insert(schema.holidays).values({ ...input, source: "custom" });
    });
    return undefined;
  });
}

/** Removes a custom holiday, or brings back a built-in one that was hidden. */
export async function deleteHoliday(id: number): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    await db.delete(schema.holidays).where(eq(schema.holidays.id, id));
    return undefined;
  });
}

/** Takes a built-in holiday off the calendar for that year. */
export async function hideBuiltInHoliday(date: string, name: string): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    const known = isDay(date) && builtInHolidays(Number(date.slice(0, 4))).some((h) => h.date === date && h.name === name);
    if (!known) throw new Error("That isn't a built-in holiday.");
    await db.insert(schema.holidays).values({ date, name, dayOff: false, source: "hidden" });
    return undefined;
  });
}

// ---- Blocked days ---------------------------------------------------------------------------------------------

const blockedInput = z
  .object({
    startDate: day("the first day"),
    endDate: day("the last day"),
    reason: z.string().trim().min(1, "Say why, so people know").max(200, "Keep it under 200 characters"),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "The last day can't be before the first day" });

/**
 * Blocks days for time off. Returns how many requests already on those days are still standing, so the super
 * admin can look at them (they aren't cancelled automatically).
 */
export async function addBlockedPeriod(_prev: unknown, formData: FormData): Promise<Result<{ affected: number }>> {
  return run(async () => {
    const auth = await requireRole("super_admin");
    const raw = Object.fromEntries(formData);
    const input = blockedInput.parse({ ...raw, endDate: raw.endDate || raw.startDate });
    await db.insert(schema.blockedPeriods).values({ ...input, createdById: auth.user.id });
    const affected = await db.$count(
      schema.timeOff,
      and(
        inArray(schema.timeOff.status, ["pending", "approved"]),
        inArray(schema.timeOff.kind, schema.timeOffKind.enumValues.filter(blockable)),
        lte(schema.timeOff.startDate, input.endDate),
        gte(schema.timeOff.endDate, input.startDate),
      ),
    );
    return { affected };
  });
}

export async function deleteBlockedPeriod(id: number): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
    await db.delete(schema.blockedPeriods).where(eq(schema.blockedPeriods.id, id));
    return undefined;
  });
}

// ---- Events ---------------------------------------------------------------------------------------------------

const time = z
  .string()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Times look like 09:30");

const eventInput = z
  .object({
    title: z.string().trim().min(1, "Give the event a title").max(160),
    description: optionalText(2000),
    location: optionalText(200),
    startDate: day("the date"),
    endDate: z.string().optional(),
    startTime: time,
    endTime: time,
    teamId: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : null)),
    repeat: z.enum(REPEATS).default("none"),
    // "1,3,5": weekdays, 0 = Sunday.
    repeatDays: z
      .string()
      .optional()
      .transform((v) => [...new Set((v ?? "").split(",").filter(Boolean).map(Number))].sort())
      .refine((v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6), "Pick days of the week"),
    repeatUntil: z
      .string()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || isDay(v), "Pick the day the repeat ends"),
  })
  .transform((v) => {
    const endDate = v.endDate && isDay(v.endDate) ? v.endDate : v.startDate;
    // Only daily and weekly repeats use days of the week; a weekly repeat without any is on the first day's weekday.
    const repeatDays =
      v.repeat === "weekly" ? (v.repeatDays.length ? v.repeatDays : [weekday(v.startDate)]) : v.repeat === "daily" && v.repeatDays.length && v.repeatDays.length < 7 ? v.repeatDays : null;
    return { ...v, endDate, repeatDays, repeatUntil: v.repeat === "none" ? null : v.repeatUntil };
  })
  .refine((v) => !v.repeatUntil || v.repeatUntil >= v.startDate, { message: "The repeat can't end before the first day" })
  .refine((v) => v.endDate >= v.startDate, { message: "The event can't end before it starts" })
  .refine((v) => !v.endTime || v.startTime, { message: "Add a start time too" })
  .refine((v) => !(v.startTime && v.endTime && v.startDate === v.endDate && v.endTime <= v.startTime), {
    message: "The event can't end before it starts",
  });

/** Company-wide events are for super admins; a team leader adds events for the teams they lead. */
function canEditEvent(auth: Auth, teamId: number | null) {
  if (auth.role === "super_admin") return true;
  return teamId !== null && auth.role === "leader" && auth.ledTeamIds.includes(teamId);
}

export async function saveEvent(eventId: number | null, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const input = eventInput.parse(Object.fromEntries(formData));
    if (!canEditEvent(auth, input.teamId)) {
      throw new Error(auth.role === "leader" ? "Pick your team: company-wide events are added by a super admin." : "You can't add events.");
    }
    if (eventId === null) {
      await db.insert(schema.events).values({ ...input, createdById: auth.user.id });
    } else {
      const existing = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
      if (!existing || !canEditEvent(auth, existing.teamId)) throw new Error("You can't change this event.");
      await db.update(schema.events).set(input).where(eq(schema.events.id, eventId));
    }
    return undefined;
  });
}

export async function deleteEvent(eventId: number): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const existing = await db.query.events.findFirst({ where: eq(schema.events.id, eventId) });
    if (!existing) return undefined;
    if (!canEditEvent(auth, existing.teamId)) throw new Error("You can't delete this event.");
    await db.delete(schema.events).where(eq(schema.events.id, eventId));
    return undefined;
  });
}

// ---- Documents on time off ------------------------------------------------------------------------------------

/**
 * Removes a file attached to time off: the person's own, or as someone who approves their time off. If it was the
 * last file on sick leave, the person is reminded again that a sick note is needed.
 */
export async function deleteTimeOffDocument(documentId: number): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const doc = await db.query.timeOffDocuments.findFirst({
      where: eq(schema.timeOffDocuments.id, documentId),
      columns: { id: true, timeOffId: true },
    });
    if (!doc) throw new Error("That file is already gone.");
    const row = await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, doc.timeOffId) });
    const person = row ? await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) }) : undefined;
    if (!row || !person || !canManagePerson(auth, person)) throw new Error("You can't remove this file.");
    await db.delete(schema.timeOffDocuments).where(eq(schema.timeOffDocuments.id, documentId));
    return undefined;
  });
}
