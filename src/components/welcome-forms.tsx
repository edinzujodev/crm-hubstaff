"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { Button, InputText } from "@/components/ui";
import { CodeInput } from "@/components/code-input";
import { DateInput } from "@/components/date-input";
import { confirmTotpSetup, finishOnboarding, saveOnboardingAbout } from "@/app/actions";

type State = { ok: true; data: undefined } | { ok: false; error: string } | null;

/** Goes to `next` once the step's action went through. */
function useNextOnSuccess(state: State, next: string) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.replace(next);
  }, [state, next, router]);
}

function ErrorNote({ state }: { state: State }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
      <i className="pi pi-exclamation-circle mt-0.5 text-sm" aria-hidden />
      {state.error}
    </p>
  );
}

/** The bar at the bottom of a step: Previous on the left, the step's main button on the right. */
function StepFooter({ back, pending, label, disabled }: { back?: string; pending: boolean; label: string; disabled?: boolean }) {
  return (
    <div className="mt-auto flex items-center justify-between gap-3 border-t border-border px-6 py-4 sm:px-10">
      {back ? (
        <Link href={back} className="flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
          <i className="pi pi-arrow-left text-xs" aria-hidden /> Previous
        </Link>
      ) : (
        <span />
      )}
      <Button disabled={pending || disabled} icon={pending ? "pi pi-spin pi-spinner" : "pi pi-arrow-right"} iconPos="right" label={pending ? "Saving…" : label} />
    </div>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md flex-1 space-y-5 px-6 pb-8 sm:px-0">{children}</div>;
}

function Field({ label, hint, children, optional }: { label: string; hint?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
      <span>
        {label}
        {optional && <span className="font-normal"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="font-normal">{hint}</span>}
    </label>
  );
}

/** Step 1: scan the QR code with an authenticator app, then type the code it shows. Goes to `next` once it's on. */
export function TotpSetupForm({
  qrSvg,
  secret,
  account,
  next,
  label,
}: {
  qrSvg: string;
  secret: string;
  account: string;
  next: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(confirmTotpSetup, null);
  useNextOnSuccess(state, next);
  const [copied, setCopied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state && !state.ok) setAttempt((a) => a + 1);
  }

  return (
    <form action={action} className="flex flex-1 flex-col">
      <Body>
        <ol className="space-y-5 text-sm">
          <li className="flex gap-3">
            <Num n={1} />
            <div>
              <p className="font-medium">Install an authenticator app on your phone</p>
              <p className="text-xs text-muted">Google Authenticator, Microsoft Authenticator or 1Password all work.</p>
            </div>
          </li>
          <li className="flex gap-3">
            <Num n={2} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-medium">Scan this QR code with the app</p>
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="h-40 w-40 shrink-0 rounded-xl border border-border bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
                  role="img"
                  aria-label={`QR code to add Client tracker (${account}) to your authenticator app`}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className="min-w-0 space-y-1.5 text-xs text-muted">
                  <p>Can&apos;t scan? Enter this key in the app:</p>
                  <code className="block break-all rounded-md bg-foreground/5 px-2 py-1.5 font-mono text-[13px] tracking-wider text-foreground">{secret}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(secret.replace(/\s/g, ""));
                      setCopied(true);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 font-medium text-foreground hover:underline"
                  >
                    <i className={`pi ${copied ? "pi-check" : "pi-copy"} text-xs`} aria-hidden /> {copied ? "Copied" : "Copy key"}
                  </button>
                </div>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <Num n={3} />
            <div className="space-y-3">
              <p className="font-medium">Type the 6-digit code the app shows</p>
              <CodeInput key={attempt} disabled={pending} invalid={!!state && !state.ok} />
            </div>
          </li>
        </ol>
        <ErrorNote state={state} />
        <p className="flex gap-2.5 rounded-lg bg-foreground/5 px-3 py-2.5 text-xs text-muted">
          <i className="pi pi-info-circle mt-0.5 text-sm text-foreground" aria-hidden />
          <span>
            From now on you&apos;ll sign in with Google and then a code from this app. Keep the app on your phone; if you lose it,
            your super admin can reset it.
          </span>
        </p>
      </Body>
      <StepFooter pending={pending} label={label} />
    </form>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
      {n}
    </span>
  );
}

export type AboutValues = { name: string; phone: string; birthDate: string; address: string };

/** Step 2: about you. */
export function AboutForm({ initial, today }: { initial: AboutValues; today: string }) {
  const [state, action, pending] = useActionState(saveOnboardingAbout, null);
  useNextOnSuccess(state, "/welcome?step=3");
  const [values, setValues] = useState(initial);
  const field = (k: keyof AboutValues) => ({
    name: k,
    value: values[k],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });

  return (
    <form action={action} className="flex flex-1 flex-col">
      <Body>
        <Field label="Full name">
          <InputText {...field("name")} required maxLength={120} autoFocus className="w-full text-foreground" />
        </Field>
        <Field label="Mobile number" optional hint="So colleagues can reach you.">
          <InputText {...field("phone")} type="tel" maxLength={40} placeholder="+387 61 234 567" className="w-full text-foreground" />
        </Field>
        <Field label="Birth date" optional>
          <DateInput {...field("birthDate")} max={today} className="w-full" />
        </Field>
        <Field label="Address" optional>
          <InputText {...field("address")} maxLength={300} placeholder="Street, city" className="w-full text-foreground" />
        </Field>
        <ErrorNote state={state} />
      </Body>
      <StepFooter back={undefined} pending={pending} label="Next step" disabled={!values.name.trim()} />
    </form>
  );
}

/** Step 3: you at the company. Finishing it shows the "all set" screen. */
export function CompanyForm({
  initial,
  today,
  team,
}: {
  initial: { jobTitle: string; startedOn: string };
  today: string;
  team: { name: string; leader: string | null } | null;
}) {
  const [state, action, pending] = useActionState(finishOnboarding, null);
  useNextOnSuccess(state, "/welcome?step=done");
  const [jobTitle, setJobTitle] = useState(initial.jobTitle);
  const [startedOn, setStartedOn] = useState(initial.startedOn);

  return (
    <form action={action} className="flex flex-1 flex-col">
      <Body>
        <Field label="Job title">
          <InputText
            name="jobTitle"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
            maxLength={120}
            autoFocus
            placeholder="e.g. Bookkeeper"
            className="w-full text-foreground"
          />
        </Field>
        <Field label="When did you start working here?" optional>
          <DateInput name="startedOn" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} max={today} className="w-full" />
        </Field>
        <div className="rounded-lg border border-border px-4 py-3 text-sm">
          <p className="text-xs font-medium text-muted">Your team</p>
          {team ? (
            <p className="mt-0.5">
              <span className="font-medium">{team.name}</span>
              {team.leader && <span className="text-muted"> · led by {team.leader}</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-muted">Not in a team yet. Your team leader or super admin adds you on the Teams page.</p>
          )}
        </div>
        <ErrorNote state={state} />
      </Body>
      <StepFooter back="/welcome?step=2" pending={pending} label="Finish" disabled={!jobTitle.trim()} />
    </form>
  );
}
