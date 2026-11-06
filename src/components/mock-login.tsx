"use client";

import { useActionState } from "react";
import { mockSignIn } from "@/app/actions";

type Account = { name: string; email: string; role: string };

/**
 * Stand-in for Google's account chooser, used until GOOGLE_CLIENT_ID is set. Picking an account signs in
 * as that person; typing an email that isn't on the approved list shows what a rejected sign-in looks like.
 */
export function MockLogin({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(mockSignIn, null);
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium">Simulated Google sign-in</p>
        <p className="text-muted">
          Google isn&apos;t connected yet, so this stands in for it. Pick who you are. It only works on your own
          computer and turns off once Google is set up.
        </p>
      </div>

      <form action={action} className="space-y-2">
        <p className="text-xs text-muted">Approved accounts</p>
        {accounts.map((a) => (
          <button
            key={a.email}
            name="email"
            value={a.email}
            disabled={pending}
            className="card flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:brightness-95 disabled:opacity-50"
          >
            <span>
              <span className="block font-medium">{a.name}</span>
              <span className="block text-xs text-muted">{a.email}</span>
            </span>
            <span className="badge">{a.role}</span>
          </button>
        ))}
      </form>

      <form action={action} className="space-y-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Or use another email
          <input name="email" type="email" required placeholder="someone@example.com" className="input text-foreground" />
        </label>
        <button className="btn" disabled={pending}>
          Continue
        </button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
