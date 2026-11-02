"use client";

import { useEffect, useState, useTransition } from "react";
import { syncIfStale, syncNow } from "@/app/actions";

const AUTO_SYNC_MS = 5 * 60 * 1000;

/** "Sync now" button that also pulls from Hubstaff in the background while the app is open. */
export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = () =>
      startTransition(async () => {
        const res = await syncIfStale();
        setError(res.ok ? null : res.error);
      });
    run();
    const t = setInterval(run, AUTO_SYNC_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="max-w-64 truncate text-xs text-red-600" title={error}>
          Sync failed: {error}
        </span>
      )}
      <button
        className="btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await syncNow();
            setError(res.ok ? null : res.error);
          })
        }
      >
        {pending ? "Syncing…" : "Sync Hubstaff"}
      </button>
    </span>
  );
}
