"use client";

import { Button } from "@/components/ui";
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
  const lastRun = useRef(0);

  async function sync(force: boolean) {
    if (busy.current) return;
    busy.current = true;
    lastRun.current = Date.now();
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

  // Background syncs only while the tab is visible: a hidden tab would redraw its page for nobody. Coming back
  // to the tab catches up at once if a sync is due.
  useEffect(() => {
    const due = () => Date.now() - lastRun.current >= AUTO_SYNC_MS;
    const first = setTimeout(() => void sync(false), FIRST_SYNC_DELAY_MS);
    const every = setInterval(() => {
      if (!document.hidden) void sync(false);
    }, AUTO_SYNC_MS);
    const onVisible = () => {
      if (!document.hidden && due()) void sync(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
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
      <Button severity="secondary" outlined disabled={pending} onClick={() => void sync(true)}>
        {pending ? "Syncing…" : "Sync Hubstaff"}
      </Button>
    </span>
  );
}
