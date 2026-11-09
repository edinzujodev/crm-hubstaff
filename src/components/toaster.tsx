"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FINISHED_EVENT, type FinishedNotice } from "@/lib/toast";
import { truncate } from "@/lib/format";

const SHOW_MS = 12000;

export function Toaster() {
  const [notice, setNotice] = useState<(FinishedNotice & { key: number }) | null>(null);

  useEffect(() => {
    const onFinished = (e: Event) => setNotice({ ...(e as CustomEvent<FinishedNotice>).detail, key: Date.now() });
    window.addEventListener(FINISHED_EVENT, onFinished);
    return () => window.removeEventListener(FINISHED_EVENT, onFinished);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="card space-y-3 border-emerald-500/60 p-4 text-sm shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">✓ Task finished</p>
          <button type="button" aria-label="Dismiss" className="text-muted" onClick={() => setNotice(null)}>
            ✕
          </button>
        </div>
        <p>
          <span className="font-medium">{truncate(notice.title, 50)}</span> was moved to{" "}
          <Link className="underline" href="/tasks?show=done">
            Done
          </Link>
          .
        </p>
        {notice.nextTaskId ? (
          <p className="rounded-md bg-emerald-500/10 p-2">
            ↻ A new task was created
            {notice.nextDueDate ? <> and is due <span className="font-medium">{notice.nextDueDate}</span></> : null}.{" "}
            <Link className="font-medium underline" href={`/tasks/${notice.nextTaskId}`}>
              Open new task
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
