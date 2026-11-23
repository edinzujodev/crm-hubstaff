import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "@/app/actions";
import { AuthLogo, AuthShell } from "@/components/auth-shell";
import { LoginIllustration } from "@/components/login-illustration";
import { VerifyCodeForm } from "@/components/verify-code-form";
import { getAuth } from "@/lib/auth";
import { pendingSession } from "@/lib/session";

async function VerifyContent() {
  await connection();
  if (await getAuth()) redirect("/");
  const pending = await pendingSession();
  if (!pending) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5">
          <i className="pi pi-mobile text-xl" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Two-step verification</h1>
        <p className="text-sm text-muted">
          Open your authenticator app and type the 6-digit code for <span className="font-medium text-foreground">Client tracker</span>.
        </p>
      </div>
      <VerifyCodeForm />
      <div className="space-y-1 text-center text-xs text-muted">
        <p>
          Signed in as <span className="font-medium text-foreground">{pending.user.email}</span>.
        </p>
        <form action={signOut}>
          <button className="cursor-pointer underline underline-offset-2 hover:text-foreground">Use another account</button>
        </form>
        <p className="pt-2">Lost your phone? Ask your super admin to reset two-step verification.</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <AuthShell
      side={
        <>
          <AuthLogo />
          <h2 className="text-2xl font-semibold leading-snug sm:text-3xl">
            One more step
            <br />
            <span className="text-white/85">Keeping your work safe.</span>
          </h2>
          <LoginIllustration className="mt-auto hidden w-full max-w-md self-center md:block" />
        </>
      }
    >
      <div className="flex flex-1 items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-sm">
          <Suspense>
            <VerifyContent />
          </Suspense>
        </div>
      </div>
    </AuthShell>
  );
}
