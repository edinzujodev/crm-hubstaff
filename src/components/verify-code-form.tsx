"use client";

import { Button } from "@/components/ui";
import { CodeInput } from "@/components/code-input";
import { useActionState, useState } from "react";
import { verifySignInCode } from "@/app/actions";

/** The authenticator code after Google sign-in. A wrong code clears the boxes for a new try. */
export function VerifyCodeForm() {
  const [state, action, pending] = useActionState(verifySignInCode, null);
  // A fresh set of boxes after each wrong code.
  const [attempt, setAttempt] = useState(0);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.error) setAttempt((a) => a + 1);
  }

  return (
    <form action={action} className="space-y-5">
      <div className="flex justify-center">
        <CodeInput key={attempt} autoFocus disabled={pending} invalid={!!state?.error} />
      </div>
      {state?.error && (
        <p role="alert" className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300">
          <i className="pi pi-exclamation-circle mt-0.5 text-sm" aria-hidden />
          {state.error}
        </p>
      )}
      <Button className="w-full justify-center" disabled={pending}>
        {pending ? "Checking…" : "Verify and continue"}
      </Button>
    </form>
  );
}
