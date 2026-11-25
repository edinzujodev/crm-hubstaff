import { FormSkeleton } from "@/components/page-skeleton";
import { Suspense }
 from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LeaveTiles } from "@/components/balance-tiles";
import { LeaveRequests, type LeaveRequest } from "@/components/leave-requests";
import { TimeOffButton } from "@/components/time-off";
import { ymd } from "@/lib/days";
import { blockedBetween, daysOffBetween } from "@/lib/holidays";
import { countDays, TIME_OFF_KINDS, type TimeOffKind } from "@/lib/leave-days";
import { ProfileForm } from "@/components/profile-form";
import { pageGuard } from "@/lib/auth";
import { authMode } from "@/lib/session";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { balanceFor } from "@/lib/time-off";

const ROLE_LABEL = { super_admin: "Super admin", leader: "Team leader", worker: "Member" } as const;

/** A yyyy-mm-dd day as "3 Mar 2024". */
function fmtDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

async function ProfileContent() {
  await connection();
  const auth = await pageGuard();
  const me = auth.user;
  const today = localDay(new Date(), config.timeZone);

  const year = Number(today.slice(0, 4));
  const [team, balance, history, formDaysOff, blocked] = await Promise.all([
    me.teamId ? db.query.teams.findFirst({ where: eq(schema.teams.id, me.teamId) }) : undefined,
    balanceFor(me.id, year, today),
    db.select().from(schema.timeOff).where(eq(schema.timeOff.userId, me.id)).orderBy(desc(schema.timeOff.startDate)),
    // For the request form: it counts working days and shows holidays and blocked days in the picker.
    daysOffBetween(ymd(year, 1, 1), ymd(year + 1, 12, 31)),
    blockedBetween(today, ymd(year + 1, 12, 31)),
  ]);
  // Public holidays inside the history (and this year, for the tiles) don't count as days taken.
  const yearStart = ymd(year, 1, 1);
  const yearEnd = ymd(year, 12, 31);
  const daysOff = await daysOffBetween(
    history.reduce((m, t) => (t.startDate < m ? t.startDate : m), yearStart),
    history.reduce((m, t) => (t.endDate > m ? t.endDate : m), yearEnd),
  );
  const taken = Object.fromEntries(TIME_OFF_KINDS.map((k) => [k, 0])) as Record<TimeOffKind, number>;
  for (const t of history) {
    if (t.status === "approved") taken[t.kind] += countDays(t, daysOff, yearStart, yearEnd);
  }
  const requests: LeaveRequest[] = history.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    halfDay: t.halfDay,
    days: countDays(t, daysOff),
    decisionNote: t.decisionNote,
    // Requests still waiting, and time off that hasn't started yet, can be called off.
    cancellable: t.status === "pending" || (t.status === "approved" && (t.startDate > today || t.kind === "sick")),
  }));
  const leader =
    team?.leaderId && team.leaderId !== me.id
      ? await db.query.users.findFirst({ where: eq(schema.users.id, team.leaderId), columns: { name: true } })
      : undefined;

  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const google = authMode() === "google";

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-(--primary-fg)">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{me.name}</h1>
          <p className="truncate text-sm text-muted">{me.jobTitle || me.email}</p>
        </div>
        <span className="badge">{ROLE_LABEL[auth.role]}</span>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Personal details</h2>
          <p className="text-xs text-muted">Only you can change these. Your colleagues see your name and job title.</p>
        </div>
        <ProfileForm
          today={today}
          initial={{
            name: me.name,
            jobTitle: me.jobTitle ?? "",
            phone: me.phone ?? "",
            birthDate: me.birthDate ?? "",
            address: me.address ?? "",
          }}
        />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Work</h2>
          <p className="text-xs text-muted">Set by a super admin or your team leader in HR.</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Role">{ROLE_LABEL[auth.role]}</Fact>
          <Fact label="Team">{team?.name ?? "No team"}</Fact>
          <Fact label="Team leader">{team?.leaderId === me.id ? "You" : (leader?.name ?? "—")}</Fact>
          <Fact label="Hubstaff user id">
            <span className="font-mono">{me.hubstaffUserId ?? "Not linked"}</span>
          </Fact>
          <Fact label="Started">{me.startedOn ? fmtDate(me.startedOn) : "—"}</Fact>
        </dl>
      </section>

leton } from "@/components/page-skeleton";
import { Suspense } from "react";
import { connection } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { LeaveTiles } from "@/components/balance-tiles";
import { LeaveRequests, type LeaveRequest } from "@/components/leave-requests";
import { TimeOffButton } from "@/components/time-off";
import { ymd } from "@/lib/days";
import { blockedBetween, daysOffBetween } from "@/lib/holidays";
import { countDays, TIME_OFF_KINDS, type TimeOffKind } from "@/lib/leave-days";
import { ProfileForm } from "@/components/profile-form";
import { pageGuard } from "@/lib/auth";
import { authMode } from "@/lib/session";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { balanceFor } from "@/lib/time-off";

const ROLE_LABEL = { super_admin: "Super admin", leader: "Team leader", worker: "Member" } as const;

/** A yyyy-mm-dd day as "3 Mar 2024". */
function fmtDate(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y!, m! - 1, d!)),
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

async function ProfileContent() {
  await connection();
  const auth = await pageGuard();
  const me = auth.user;
  const today = localDay(new Date(), config.timeZone);

  const year = Number(today.slice(0, 4));
  const [team, balance, history, formDaysOff, blocked] = await Promise.all([
    me.teamId ? db.query.teams.findFirst({ where: eq(schema.teams.id, me.teamId) }) : undefined,
    balanceFor(me.id, year, today),
    db.select().from(schema.timeOff).where(eq(schema.timeOff.userId, me.id)).orderBy(desc(schema.timeOff.startDate)),
    // For the request form: it counts working days and shows holidays and blocked days in the picker.
    daysOffBetween(ymd(year, 1, 1), ymd(year + 1, 12, 31)),
    blockedBetween(today, ymd(year + 1, 12, 31)),
  ]);
  // Public holidays inside the history (and this year, for the tiles) don't count as days taken.
  const yearStart = ymd(year, 1, 1);
  const yearEnd = ymd(year, 12, 31);
  const daysOff = await daysOffBetween(
    history.reduce((m, t) => (t.startDate < m ? t.startDate : m), yearStart),
    history.reduce((m, t) => (t.endDate > m ? t.endDate : m), yearEnd),
  );
  const taken = Object.fromEntries(TIME_OFF_KINDS.map((k) => [k, 0])) as Record<TimeOffKind, number>;
  for (const t of history) {
    if (t.status === "approved") taken[t.kind] += countDays(t, daysOff, yearStart, yearEnd);
  }
  const requests: LeaveRequest[] = history.map((t) => ({
    id: t.id,
    kind: t.kind,
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    halfDay: t.halfDay,
    days: countDays(t, daysOff),
    decisionNote: t.decisionNote,
    // Requests still waiting, and time off that hasn't started yet, can be called off.
    cancellable: t.status === "pending" || (t.status === "approved" && (t.startDate > today || t.kind === "sick")),
  }));
  const leader =
    team?.leaderId && team.leaderId !== me.id
      ? await db.query.users.findFirst({ where: eq(schema.users.id, team.leaderId), columns: { name: true } })
      : undefined;

  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const google = authMode() === "google";

  return (
    <div className="space-y-5">
      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-(--primary-fg)">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{me.name}</h1>
          <p className="truncate text-sm text-muted">{me.jobTitle || me.email}</p>
        </div>
        <span className="badge">{ROLE_LABEL[auth.role]}</span>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Personal details</h2>
          <p className="text-xs text-muted">Only you can change these. Your colleagues see your name and job title.</p>
        </div>
        <ProfileForm
          today={today}
          initial={{
            name: me.name,
            jobTitle: me.jobTitle ?? "",
            phone: me.phone ?? "",
            birthDate: me.birthDate ?? "",
            address: me.address ?? "",
          }}
        />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Work</h2>
          <p className="text-xs text-muted">Set by a super admin or your team leader in HR.</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Role">{ROLE_LABEL[auth.role]}</Fact>
          <Fact label="Team">{team?.name ?? "No team"}</Fact>
          <Fact label="Team leader">{team?.leaderId === me.id ? "You" : (leader?.name ?? "—")}</Fact>
          <Fact label="Hubstaff user id">
            <span className="font-mono">{me.hubstaffUserId ?? "Not linked"}</span>
          </Fact>
          <Fact label="Started">{me.startedOn ? fmtDate(me.startedOn) : "—"}</Fact>
        </dl>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">My time off</h2>
            <p className="text-xs text-muted">Your days off in {year} and everything you have asked for.</p>
          </div>
          <TimeOffButton
            label="Add request"
            icon="pi-plus"
            me={{ id: me.id, name: me.name }}
            people={[]}
            daysOff={[...formDaysOff]}
            vacationLeft={Math.max(0, balance.left - balance.pending)}
            selfApproves={auth.role === "super_admin"}
            blocked={blocked.map(({ startDate, endDate, reason }) => ({ startDate, endDate, reason }))}
          />
        </div>
        <LeaveTiles b={balance} taken={taken} today={today} />
        <h3 className="pt-2 font-semibold">My requests</h3>
        <LeaveRequests items={requests} />
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Sign-in & security</h2>
          <p className="text-xs text-muted">
            You sign in with your Google account, so the CRM keeps no password for you.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <dl>
            <Fact label="Google account">{me.email}</Fact>
          </dl>
          {google ? (
            <a
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noreferrer"
              className="p-button p-button-secondary p-button-outlined p-button-sm"
            >
              Change password at Google ↗
            </a>
          ) : (
            <span className="text-xs text-muted">Google sign-in isn&apos;t set up yet (development sign-in).</span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <dl>
            <Fact label="Two-step verification">
              {me.totpEnabledAt ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <i className="pi pi-shield text-xs" aria-hidden /> On · authenticator app since {fmtDate(localDay(me.totpEnabledAt, config.timeZone))}
                </span>
              ) : (
                "Off"
              )}
            </Fact>
          </dl>
          <span className="text-xs text-muted">New phone? Ask your super admin to reset it, then set it up again.</span>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Suspense fallback={<FormSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
