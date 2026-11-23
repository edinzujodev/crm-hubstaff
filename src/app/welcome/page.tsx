import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { db, schema } from "@/db";
import { AuthLogo, AuthShell } from "@/components/auth-shell";
import { LoginIllustration } from "@/components/login-illustration";
import { AboutForm, CompanyForm, TotpSetupForm } from "@/components/welcome-forms";
import { getAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { localDay } from "@/lib/format";
import { groupSecret, newTotpSecret, totpUri } from "@/lib/totp";

const STEPS = [
  { title: "Secure your account", sub: "Set up two-step verification" },
  { title: "Tell us about yourself", sub: "So your colleagues know who you are" },
  { title: "You at the company", sub: "Your role and when you started" },
];

/** The steps on the left: done ones get a check, the current one is highlighted. */
function Stepper({ current }: { current: number }) {
  return (
    <ol className="space-y-0">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                  done ? "border-white bg-white text-[#18181b]" : active ? "border-white bg-white/25" : "border-white/40"
                }`}
              >
                {done && <i className="pi pi-check text-[10px] font-bold" aria-hidden />}
              </span>
              {i < STEPS.length - 1 && <span className={`my-1 h-8 w-0.5 ${done ? "bg-white" : "bg-white/30"}`} />}
            </div>
            <div className={`pb-4 ${active || done ? "text-white" : "text-white/50"}`}>
              <p className="text-sm font-medium leading-6">{s.title}</p>
              <p className="text-xs opacity-75">{s.sub}</p>
              {active && <span className="sr-only">(current step)</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepHeading({ index, title, sub }: { index: number; title: string; sub: string }) {
  return (
    <div className="space-y-1 px-6 pb-6 pt-10 text-center sm:pt-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Step {index + 1}/{STEPS.length}
      </p>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{sub}</p>
    </div>
  );
}

async function WelcomeContent({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  await connection();
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const me = auth.user;
  const wanted = (await searchParams).step;
  const today = localDay(new Date(), config.timeZone);

  // Everything done: the "all set" screen right after the last step (finishing refreshes this page while it still
  // shows step 3, so any step in the link counts), otherwise straight to the dashboard.
  if (me.onboardedAt && me.totpEnabledAt) {
    if (wanted) return <Done name={me.name} />;
    redirect("/dashboard");
  }

  // Two-step verification always comes first.
  const step = !me.totpEnabledAt ? 0 : wanted === "3" ? 2 : 1;

  // Someone who finished the setup before and only needs the authenticator again (e.g. after a super admin reset
  // it) gets just that, without the "Get started" steps, and goes straight to the dashboard afterwards.
  if (me.onboardedAt) {
    return (
      <AuthShell
        wide
        side={
          <>
            <AuthLogo />
            <div className="space-y-1">
              <h2 className="text-3xl font-semibold">Welcome back</h2>
              <p className="text-sm text-white/70">Set up two-step verification again to continue.</p>
            </div>
          </>
        }
      >
        <div className="space-y-1 px-6 pb-6 pt-10 text-center sm:pt-12">
          <h1 className="text-xl font-semibold tracking-tight">{STEPS[0]!.title}</h1>
          <p className="text-sm text-muted">{STEPS[0]!.sub}</p>
        </div>
        <TotpSetupForm {...await totpSetup(me)} next="/dashboard" label="Continue" />
      </AuthShell>
    );
  }

  let body: React.ReactNode;
  if (step === 0) {
    body = <TotpSetupForm {...await totpSetup(me)} next="/welcome?step=2" label="Next step" />;
  } else if (step === 1) {
    body = (
      <AboutForm
        today={today}
        initial={{ name: me.name, phone: me.phone ?? "", birthDate: me.birthDate ?? "", address: me.address ?? "" }}
      />
    );
  } else {
    const team = me.teamId ? await db.query.teams.findFirst({ where: eq(schema.teams.id, me.teamId) }) : undefined;
    const leader =
      team?.leaderId && team.leaderId !== me.id
        ? await db.query.users.findFirst({ where: eq(schema.users.id, team.leaderId), columns: { name: true } })
        : undefined;
    body = (
      <CompanyForm
        today={today}
        initial={{ jobTitle: me.jobTitle ?? "", startedOn: me.startedOn ?? "" }}
        team={team ? { name: team.name, leader: team.leaderId === me.id ? "you" : (leader?.name ?? null) } : null}
      />
    );
  }

  return (
    <AuthShell
      wide
      side={
        <>
          <AuthLogo />
          <div className="space-y-1">
            <h2 className="text-3xl font-semibold">Get started</h2>
            <p className="text-sm text-white/70">Welcome, {me.name.split(/\s+/)[0]}! A few things before you begin.</p>
          </div>
          <Stepper current={step} />
        </>
      }
    >
      <StepHeading index={step} title={STEPS[step]!.title} sub={STEPS[step]!.sub} />
      {body}
    </AuthShell>
  );
}

/** What the authenticator step shows. A secret is made the first time it opens and kept until the first code confirms it. */
async function totpSetup(me: { id: number; email: string; totpSecret: string | null }) {
  let secret = me.totpSecret;
  if (!secret) {
    secret = newTotpSecret();
    await db.update(schema.users).set({ totpSecret: secret }).where(eq(schema.users.id, me.id));
  }
  const qrSvg = await QRCode.toString(totpUri(secret, me.email), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return { qrSvg, secret: groupSecret(secret), account: me.email };
}

function Done({ name }: { name: string }) {
  return (
    <AuthShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center sm:p-12">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-linear-to-br from-[#3f3f46] to-[#18181b] px-6 pt-6">
          <LoginIllustration className="w-full" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">You&apos;re all set, {name.split(/\s+/)[0]}!</h1>
          <p className="text-sm text-muted">Your account is secured and your profile is ready.</p>
        </div>
        <Link href="/dashboard" className="p-button gap-2 no-underline">
          Let&apos;s start <i className="pi pi-arrow-right text-sm" aria-hidden />
        </Link>
      </div>
    </AuthShell>
  );
}

/** First sign-in: two-step verification, then a few details about the person, then the dashboard. */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <Suspense>
      <WelcomeContent searchParams={searchParams} />
    </Suspense>
  );
}
