import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, schema } from "@/db";
import { AddMemberForm } from "@/components/add-member-form";
import { MockLogin } from "@/components/mock-login";
import { getAuth } from "@/lib/auth";
import { authMode } from "@/lib/session";

const ERRORS: Record<string, string> = {
  not_approved: "That Google account isn't on the approved list. Ask a super admin to add your email on the Teams & people page.",
  domain: "That account isn't on the company domain.",
  unverified: "Google says that email isn't verified.",
  cancelled: "Sign-in was cancelled.",
  failed: "Sign-in failed. Try again.",
};

async function LoginContent({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await connection();
  if (await getAuth()) redirect("/");
  const error = (await searchParams).error;
  const mode = authMode();
  const users = await db.select().from(schema.users).orderBy(schema.users.name);

  // Nobody exists yet: the first person added becomes super admin, and can then sign in.
  if (users.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">No one has been added yet. The first person you add becomes the super admin.</p>
        <div className="card p-4">
          <AddMemberForm />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {typeof error === "string" && ERRORS[error] && <p className="text-sm text-red-600">{ERRORS[error]}</p>}
      {mode === "google" && (
        <>
          <p className="text-sm text-muted">Sign in with your company Google account.</p>
          <a href="/api/auth/google" className="btn btn-primary">
            Sign in with Google
          </a>
        </>
      )}
      {mode === "mock" && (
        <MockLogin
          accounts={users.map((u) => ({
            name: u.name,
            email: u.email,
            role: u.role === "super_admin" ? "Super admin" : "Member",
          }))}
        />
      )}
      {mode === "none" && (
        <p className="text-sm text-red-600">Sign-in isn&apos;t set up. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>
      )}
    </div>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4 pt-8">
      <h1 className="text-xl font-semibold">Sign in to Client tracker</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
