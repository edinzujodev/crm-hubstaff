"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const AUTO_SYNC_MS = 5 * 60 * 1000;
// Wait a little after the page opens so the first sync doesn't compete with loading it.
const FIRST_SYNC_DELAY_MS = 4000;

/** "Sync now" button that also pulls from Hubstaff in the background while the app is open. */
export function SyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function sync(force: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const res = await fetch(`/api/sync${force ? "?force=1" : ""}`, { method: "POST" });
      const body = (await res.json()) as { ran?: boolean; fetched?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Sync failed (${res.status})`);
      setError(null);
      // Only redraw the page when new data may have arrived.
      if (body.ran && (force || body.fetched)) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    const first = setTimeout(() => void sync(false), FIRST_SYNC_DELAY_MS);
    const every = setInterval(() => void sync(false), AUTO_SYNC_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="max-w-64 truncate text-xs text-red-600" title={error}>
          Sync failed: {error}
        </span>
      )}
      <button className="btn" disabled={pending} onClick={() => void sync(true)}>
        {pending ? "Syncing…" : "Sync Hubstaff"}
      </button>
    </span>
  );
}
