import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtRange } from "@/lib/days";
import { KIND_LABEL, needsApproval, type TimeOffKind } from "@/lib/leave-days";

/**
 * In-app notifications (the bell in the top bar). For now they cover time off:
 * - a request waits for approval → everyone who can decide on it;
 * - it is approved or rejected → the person who asked;
 * - an approver enters, changes or cancels time off for someone → that person;
 * - someone records sick leave, or cancels their own time off → the people who approve for them.
 * Nobody is told about what they did themselves.
 */
export type NotificationKind =
  | "time_off_requested"
  | "time_off_approved"
  | "time_off_rejected"
  | "time_off_added"
  | "time_off_cancelled"
  | "time_off_changed"
  | "time_off_taken"
  | "sick_leave";

type Person = { id: number; name: string; teamId: number | null };
type Request = { id: number; kind: TimeOffKind; startDate: string; endDate: string; halfDay: boolean };

const APPROVALS = "/hr/requests";
const VACATIONS = "/hr/time-off";
const MY_TIME_OFF = "/profile/time-off";

/**
 * Who decides on this person's time off: every super admin, and the leader of their team and of each team above it.
 * Never the person themselves.
 */
export async function approversFor(person: Person): Promise<number[]> {
  const ids = new Set<number>();
  const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, "super_admin"));
  for (const a of admins) ids.add(a.id);
  if (person.teamId !== null) {
    const teams = await db
      .select({ id: schema.teams.id, leaderId: schema.teams.leaderId, parentTeamId: schema.teams.parentTeamId })
      .from(schema.teams);
    const byId = new Map(teams.map((t) => [t.id, t]));
    const seen = new Set<number>();
    for (let t = byId.get(person.teamId); t && !seen.has(t.id); t = t.parentTeamId ? byId.get(t.parentTeamId) : undefined) {
      seen.add(t.id);
      if (t.leaderId) ids.add(t.leaderId);
    }
  }
  ids.delete(person.id);
  return [...ids];
}

const what = (r: Request) => `${KIND_LABEL[r.kind].toLowerCase()}${r.halfDay ? " (half day)" : ""} · ${fmtRange(r.startDate, r.endDate)}`;
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

async function send(
  userIds: number[],
  n: { kind: NotificationKind; title: string; body?: string | null; href: string; actorId: number; timeOffId: number },
) {
  const to = userIds.filter((id) => id !== n.actorId);
  if (!to.length) return;
  await db.insert(schema.notifications).values(to.map((userId) => ({ userId, ...n, body: n.body ?? null })));
}

/** After time off is entered. `approved` is whether it counted straight away. */
export async function notifyTimeOffAdded(actor: { id: number; name: string }, person: Person, r: Request, approved: boolean) {
  if (actor.id !== person.id) {
    // An approver (or super admin) entered it for them.
    await send([person.id], {
      kind: "time_off_added",
      title: `${actor.name} added ${KIND_LABEL[r.kind].toLowerCase()} for you`,
      body: fmtRange(r.startDate, r.endDate),
      href: MY_TIME_OFF,
      actorId: actor.id,
      timeOffId: r.id,
    });
    return;
  }
  if (!approved) {
    await send(await approversFor(person), {
      kind: "time_off_requested",
      title: `${person.name} asked for ${KIND_LABEL[r.kind].toLowerCase()}`,
      body: fmtRange(r.startDate, r.endDate),
      href: APPROVALS,
      actorId: actor.id,
      timeOffId: r.id,
    });
  } else if (!needsApproval(r.kind)) {
    await send(await approversFor(person), {
      kind: "sick_leave",
      title: `${person.name} is off sick`,
      body: fmtRange(r.startDate, r.endDate),
      href: VACATIONS,
      actorId: actor.id,
      timeOffId: r.id,
    });
  } else {
    // A team lead's own time off is approved straight away; whoever would have approved it is told.
    await send(await approversFor(person), {
      kind: "time_off_taken",
      title: `${person.name} is taking ${KIND_LABEL[r.kind].toLowerCase()}`,
      body: fmtRange(r.startDate, r.endDate),
      href: VACATIONS,
      actorId: actor.id,
      timeOffId: r.id,
    });
  }
}

/** After a waiting request is approved or rejected. */
export async function notifyTimeOffDecided(actor: { id: number; name: string }, person: Person, r: Request, approved: boolean, note: string | null) {
  await settleRequest(r.id);
  await send([person.id], {
    kind: approved ? "time_off_approved" : "time_off_rejected",
    title: `${firstName(actor.name)} ${approved ? "approved" : "rejected"} your ${what(r)}`,
    body: approved ? null : note,
    href: MY_TIME_OFF,
    actorId: actor.id,
    timeOffId: r.id,
  });
}

/** After time off is cancelled, by the person or by someone who approves for them. */
export async function notifyTimeOffCancelled(actor: { id: number; name: string }, person: Person, r: Request) {
  await settleRequest(r.id);
  if (actor.id === person.id) {
    await send(await approversFor(person), {
      kind: "time_off_cancelled",
      title: `${person.name} withdrew their ${KIND_LABEL[r.kind].toLowerCase()}`,
      body: fmtRange(r.startDate, r.endDate),
      href: VACATIONS,
      actorId: actor.id,
      timeOffId: r.id,
    });
  } else {
    await send([person.id], {
      kind: "time_off_cancelled",
      title: `${firstName(actor.name)} revoked your ${what(r)}`,
      href: MY_TIME_OFF,
      actorId: actor.id,
      timeOffId: r.id,
    });
  }
}

/** After someone who approves for the person changed the kind, dates or note of their time off. */
export async function notifyTimeOffChanged(actor: { id: number; name: string }, person: Person, before: Request, after: Request) {
  const moved = before.kind !== after.kind || before.startDate !== after.startDate || before.endDate !== after.endDate || before.halfDay !== after.halfDay;
  await send(actor.id === person.id ? await approversFor(person) : [person.id], {
    kind: "time_off_changed",
    title:
      actor.id === person.id
        ? `${person.name} changed their ${KIND_LABEL[after.kind].toLowerCase()}`
        : `${firstName(actor.name)} changed your ${KIND_LABEL[before.kind].toLowerCase()}`,
    body: moved ? `Now ${what(after)} (was ${what(before)})` : `${what(after)} · the note changed`,
    href: actor.id === person.id ? VACATIONS : MY_TIME_OFF,
    actorId: actor.id,
    timeOffId: after.id,
  });
}

/** A request is no longer waiting: the "asked for" notices about it stop counting as unread for every approver. */
async function settleRequest(timeOffId: number) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.timeOffId, timeOffId),
        eq(schema.notifications.kind, "time_off_requested"),
        isNull(schema.notifications.readAt),
      ),
    );
}

// ---- Reading ------------------------------------------------------------------------------------------------

export type NotificationItem = {
  id: number;
  title: string;
  body: string | null;
  href: string | null;
  actor: string | null;
  actorId: number | null;
  createdAt: string;
  read: boolean;
};

export async function unreadCount(userId: number) {
  const [row] = await db
    .select({ n: count() })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  return row?.n ?? 0;
}

export async function totalCount(userId: number) {
  const [row] = await db.select({ n: count() }).from(schema.notifications).where(eq(schema.notifications.userId, userId));
  return row?.n ?? 0;
}

/** The latest notifications (or only the unread ones), newest first. */
export async function latestNotifications(userId: number, { limit = 20, unreadOnly = false } = {}): Promise<NotificationItem[]> {
  const rows = await db
    .select({ n: schema.notifications, actor: schema.users.name })
    .from(schema.notifications)
    .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
    .where(and(eq(schema.notifications.userId, userId), unreadOnly ? isNull(schema.notifications.readAt) : undefined))
    .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
    .limit(limit);
  return rows.map(({ n, actor }) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: n.href,
    actor,
    actorId: n.actorId,
    createdAt: n.createdAt.toISOString(),
    read: n.readAt !== null,
  }));
}

/** Marks some (or, without ids, all) of a person's notifications as read. */
export async function markRead(userId: number, ids?: number[]) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, userId),
        isNull(schema.notifications.readAt),
        ids ? inArray(schema.notifications.id, ids.length ? ids : [-1]) : ne(schema.notifications.id, -1),
      ),
    );
}
