"use client";

import { useState, useTransition } from "react";
import { showTaskNow } from "@/app/actions";

/** On a repeating task: creates the next period (e.g. "February") now, without finishing this one first. */
export function NextPeriodButton({ nextTaskId, label, compact }: { nextTaskId: number; label: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`btn cursor-pointer ${compact ? "h-6 px-2 py-0 text-xs" : ""}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await showTaskNow(nextTaskId);
            setError(res.ok ? null : (res.error ?? "Something went wrong"));
          })
        }
      >
        {pending ? "Starting…" : `Start ${label} now`}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
