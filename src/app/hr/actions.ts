"use server";

import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAuth, requireRole, type Auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { fmtDays, fmtRange, isDay, weekday } from "@/lib/days";
import { REPEATS } from "@/lib/recurrence";
import { localDay } from "@/lib/format";
import { blockedBetween, builtInHolidays, daysOffBetween } from "@/lib/holidays";
import { run, type Result } from "@/lib/result";
import { balanceFor, blockable, blockedClash, canDecide, canManagePerson, countDays, KIND_LABEL, needsApproval } from "@/lib/time-off";

const today = () => localDay(new Date(), config.timeZone);

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
 * Time off for yourself, or (as their leader or a super admin) for someone else. Sick leave counts right away, and
 * so does anything an approver enters for someone; everything else waits for approval.
 */
export async function requestTimeOff(_prev: unknown, formData: FormData): Promise<Result<{ status: string }>> {
  return run(async () => {
    const auth = await requireAuth();
    const input = timeOffInput.parse(Object.fromEntries(formData));
    const person = await personFor(auth, input.userId ?? auth.user.id);
    const forSomeoneElse = person.id !== auth.user.id;

    await checkNotBlocked(auth, input);

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

    const approvedNow = !needsApproval(input.kind) || (forSomeoneElse && canDecide(auth, person)) || auth.role === "super_admin";
    await db.insert(schema.timeOff).values({
      userId: person.id,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
      halfDay: input.halfDay,
      note: input.note,
      status: approvedNow ? "approved" : "pending",
      createdById: auth.user.id,
      ...(approvedNow && needsApproval(input.kind) ? { decidedById: auth.user.id, decidedAt: new Date() } : {}),
    });
    return { status: approvedNow ? "approved" : "pending" };
  });
}

/** Approve or reject a request that is waiting. */
export async function decideTimeOff(id: number, approve: boolean, note?: string): Promise<Result> {
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
    if (approve) await checkNotBlocked(auth, row);
    await db
      .update(schema.timeOff)
      .set({ status: approve ? "approved" : "rejected", decidedById: auth.user.id, decidedAt: new Date(), decisionNote })
      .where(and(eq(schema.timeOff.id, id), eq(schema.timeOff.status, "pending")));
    return undefined;
  });
}

/**
 * Cancel time off. People cancel their own requests and approved time off that hasn't started yet; approvers can
 * cancel anything of the people they approve for.
 */
export async function cancelTimeOff(id: number): Promise<Result> {
  return run(async () => {
    const auth = await requireAuth();
    const row = await db.query.timeOff.findFirst({ where: eq(schema.timeOff.id, id) });
    if (!row) throw new Error("That time off no longer exists.");
    if (row.status === "rejected" || row.status === "cancelled") throw new Error("It's already off the calendar.");
    const person = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
    if (!person) throw new Error("That person no longer exists.");
    const own = row.userId === auth.user.id;
    const allowed =
      canDecide(auth, person) || (own && (row.status === "pending" || row.kind === "sick" || row.startDate > today()));
    if (!allowed) throw new Error("Time off that has already started can only be cancelled by your team leader.");
    await db.update(schema.timeOff).set({ status: "cancelled" }).where(eq(schema.timeOff.id, id));
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
 * A super admin sets a person's vacation days: the default per year, and for one year the allowance and the days
 * carried over from last year. An empty year field goes back to the default.
 */
export async function setAllowance(userId: number, year: number, _prev: unknown, formData: FormData): Promise<Result> {
  return run(async () => {
    await requireRole("super_admin");
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
