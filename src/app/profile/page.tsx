import { FormSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProfileForm } from "@/components/profile-form";
import { SectionHead } from "@/components/section-head";
import { pageGuard } from "@/lib/auth";
import { authMode } from "@/lib/session";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { dmy } from "@/lib/days";

const ROLE_LABEL = { super_admin: "Super admin", leader: "Team lead", worker: "Staff" } as const;

/** A yyyy-mm-dd day as "03/03/2024". */
const fmtDate = dmy;

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
  const team = me.teamId ? await db.query.teams.findFirst({ where: eq(schema.teams.id, me.teamId) }) : undefined;

  const leader =
    team?.leaderId && team.leaderId !== me.id
      ? await db.query.users.findFirst({ where: eq(schema.users.id, team.leaderId), columns: { name: true } })
      : undefined;

  const google = authMode() === "google";

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5">
        <SectionHead as="h1" title="Personal details" sub="Only you can change these. Your colleagues see your photo, name and job title." />
        {/* Keyed by the person: after switching person the form starts from their details, not the last one's. */}
        <ProfileForm
          key={me.id}
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
        <SectionHead title="Work" sub="Set by a super admin or your team lead in HR." />
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Role">{ROLE_LABEL[auth.role]}</Fact>
          <Fact label="Team">{team?.name ?? "No team"}</Fact>
          <Fact label="Team lead">{team?.leaderId === me.id ? "You" : (leader?.name ?? "—")}</Fact>
          <Fact label="Hubstaff user id">
            {me.hubstaffUserId !== null ? <span className="font-mono">{me.hubstaffUserId}</span> : "Not linked"}
          </Fact>
          <Fact label="Started">{me.startedOn ? fmtDate(me.startedOn) : "—"}</Fact>
        </dl>
      </section>

      <section className="card space-y-4 p-5">
        <SectionHead title="Sign-in & security" sub="You sign in with your Google account, so the CRM keeps no password for you." />
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
    <Suspense fallback={<FormSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}
