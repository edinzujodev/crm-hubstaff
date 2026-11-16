"use client";

import { Button } from "@/components/ui";
import { useState, useTransition } from "react";
import { showTaskNow } from "@/app/actions";

/** On a repeating task: creates the next period (e.g. "February") now, without finishing this one first. */
export function NextPeriodButton({ nextTaskId, label, compact }: { nextTaskId: number; label: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        className={`${compact ?"text-xs":""}`} severity="secondary" outlined size="small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await showTaskNow(nextTaskId);
            setError(res.ok ? null : (res.error ?? "Something went wrong"));
          })
        }
      >
        {pending ? "Starting…" : `Start ${label} now`}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
