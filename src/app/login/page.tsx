import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { AddMemberForm } from "@/components/add-member-form";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { LoginIllustration } from "@/components/login-illustration";
import { MockLogin } from "@/components/mock-login";
import { getAuth } from "@/lib/auth";
import { authMode, pendingSession } from "@/lib/session";

const ERRORS: Record<string, string> = {
  not_approved: "That Google account isn't on the approved list. Ask a super admin to add your email in HR → People.",
  domain: "Use your company Google account. Personal Google accounts can't sign in.",
  unverified: "Google says that email isn't verified.",
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in failed. Try again.",
  too_many_codes: "Too many wrong codes. Sign in with Google again to get a new try.",
};

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#18181b] shadow-sm">
        <i className="pi pi-check-square text-lg" aria-hidden />
      </span>
      <span className="text-lg font-semibold tracking-tight">Client tracker</span>
    </span>
  );
}

async function LoginContent({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await connection();
  if (await getAuth()) redirect("/");
  if (await pendingSession()) redirect("/login/verify");
  const error = (await searchParams).error;
  const mode = authMode();
  const users = await db.select().from(schema.users).orderBy(schema.users.name);

  // Nobody exists yet: the first person added becomes super admin, and can then sign in.
  if (users.length === 0) {
    return (
      <div className="space-y-4">
        <Heading title="Set up Client tracker" sub="No one has been added yet. The first person you add becomes the super admin." />
        <AddMemberForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Heading title="Sign in to Client tracker" sub="Use your company Google account to continue." />

      {typeof error === "string" && ERRORS[error] && (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
          <i className="pi pi-exclamation-circle mt-0.5 text-sm" aria-hidden />
          {ERRORS[error]}
        </p>
      )}

      {mode === "google" && (
        <div className="space-y-4">
          <GoogleSignInButton />
          <p className="text-balance text-center text-xs text-muted">
            Only people your admin has added can sign in. Can&apos;t get in? Ask your super admin.
          </p>
        </div>
      )}
      {mode === "mock" && (
        <MockLogin
          accounts={users.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role === "super_admin" ? "Super admin" : "Staff",
          }))}
        />
      )}
      {mode === "none" && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
          Sign-in isn&apos;t set up. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
        </p>
      )}
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="space-y-1.5 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{sub}</p>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="mx-auto h-6 w-56 animate-pulse rounded bg-border" />
      <div className="mx-auto h-4 w-72 animate-pulse rounded bg-border" />
      <div className="h-11 w-full animate-pulse rounded-lg bg-border" />
    </div>
  );
}

/**
 * The sign-in screen: a dark panel with the app's name and picture, and the Google button next to it.
 * It covers the whole window (the sidebar of the layout sits underneath and stays hidden).
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-surface shadow-xl ring-1 ring-border md:min-h-[560px] md:grid-cols-2">
          {/* Brand panel */}
          <section className="relative flex flex-col gap-6 overflow-hidden bg-linear-to-br from-[#3f3f46] to-[#18181b] p-8 text-white sm:p-10">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
            <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/5" />
            <Logo className="relative" />
            <h2 className="relative text-2xl font-semibold leading-snug sm:text-3xl">
              Your place to work
              <br />
              <span className="text-white/85">Plan. Track. Deliver.</span>
            </h2>
            <LoginIllustration className="relative mt-auto hidden w-full max-w-md self-center md:block" />
          </section>

          {/* Sign-in panel */}
          <section className="flex items-center justify-center p-8 sm:p-12">
            <div className="w-full max-w-sm">
              <Suspense fallback={<ContentSkeleton />}>
                <LoginContent searchParams={searchParams} />
              </Suspense>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
