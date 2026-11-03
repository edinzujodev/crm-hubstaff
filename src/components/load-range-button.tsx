"use client";

import { useState, useTransition } from "react";
import { loadHubstaffRange } from "@/app/actions";

/** Pulls Hubstaff time for the range on screen, for days before the CRM was syncing. */
export function LoadRangeButton({ from, to }: { from: string; to: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="btn"
        disabled={pending}
        title="Reads this date range from Hubstaff and stores it. Use it for days before the CRM was syncing."
        onClick={() =>
          startTransition(async () => {
            const res = await loadHubstaffRange(from, to);
            setMessage(res.ok ? `Loaded ${res.data.fetched} time slots from Hubstaff.` : res.error);
          })
        }
      >
        {pending ? "Loading…" : "Load this range from Hubstaff"}
      </button>
      {message && <span className="text-xs text-muted">{message}</span>}
    </span>
  );
}
