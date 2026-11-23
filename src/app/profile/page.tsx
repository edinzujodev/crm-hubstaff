import { FormSkeleton } from "@/components/page-skeleton";
import { Suspense } from "react";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ProfileForm } from "@/components/profile-form";
import { getAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { authMode } from "@/lib/session";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";

const ROLE_LABEL = { super_admin: "Super admin", leader: "Team leader", worker: "Member" } as const;

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
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const me = auth.user;

  const team = me.teamId ? await db.query.teams.findFirst({ where: eq(schema.teams.id, me.teamId) }) : undefined;
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
          today={localDay(new Date(), config.timeZone)}
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
          <p className="text-xs text-muted">Set by a super admin or your team leader on the Teams page.</p>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <Fact label="Role">{ROLE_LABEL[auth.role]}</Fact>
          <Fact label="Team">{team?.name ?? "No team"}</Fact>
          <Fact label="Team leader">{team?.leaderId === me.id ? "You" : (leader?.name ?? "—")}</Fact>
          <Fact label="Hubstaff user id">
            <span className="font-mono">{me.hubstaffUserId ?? "Not linked"}</span>
          </Fact>
        </dl>
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
