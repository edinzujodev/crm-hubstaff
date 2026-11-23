"use client";

import { Button, InputText } from "@/components/ui";
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
      <form action={action} className="space-y-2">
        <p className="text-xs text-muted">Approved accounts</p>
        {accounts.map((a) => (
          <button
            key={a.email}
            name="email"
            value={a.email}
            disabled={pending}
            className="card flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-primary/5 disabled:opacity-50"
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
          <InputText
            name="email"
            type="email"
            required
            placeholder="someone@example.com"
            className="w-full text-foreground"
          />
        </label>
        <Button severity="secondary" outlined disabled={pending}>
          Continue
        </Button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
