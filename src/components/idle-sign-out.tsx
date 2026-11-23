"use client";

import { useEffect } from "react";

/** Report activity to the server at most this often; each report restarts the idle clock. */
const REPORT_EVERY_MS = 60 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

/**
 * Signs the person out after IDLE_MINUTES (lib/session-cookie.ts) without activity. Clicks, typing, scrolling and
 * page loads count; the background Hubstaff sync doesn't. The server keeps the deadline, so activity in another tab
 * keeps this one signed in too. When it passes, the tab goes to the login page.
 */
export function IdleSignOut() {
  useEffect(() => {
    let lastReport = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const signedOut = () => {
      stopped = true;
      clearTimeout(timer);
      // A full page load on purpose: it drops everything the client router cached while signed in.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    };

    // Wake up just after the deadline the server gave and ask again: another tab may have pushed it back.
    const wakeAt = (deadline: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(() => void call("GET"), Math.max(deadline - Date.now(), 0) + 1000);
    };

    async function call(method: "GET" | "POST") {
      if (stopped) return;
      try {
        const res = await fetch("/api/session", { method, cache: "no-store" });
        if (res.status === 401) return signedOut();
        if (!res.ok) throw new Error(String(res.status));
        const { expiresAt } = (await res.json()) as { expiresAt: string };
        wakeAt(new Date(expiresAt).getTime());
      } catch {
        // Offline or the server is restarting: try again in a minute.
        wakeAt(Date.now() + 60 * 1000);
      }
    }

    const onActivity = () => {
      const now = Date.now();
      if (now - lastReport < REPORT_EVERY_MS) return;
      lastReport = now;
      void call("POST");
    };
    // Timers are slowed down in hidden tabs, so check as soon as the person comes back to this one.
    const onVisible = () => {
      if (document.visibilityState === "visible") void call("GET");
    };

    onActivity(); // opening a page counts
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
