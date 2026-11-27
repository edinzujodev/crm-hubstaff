"use client";

import { Button } from "@/components/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FINISHED_EVENT,
  TOAST_EVENT,
  type FinishedNotice,
  type Toast,
} from "@/lib/toast";
import { truncate } from "@/lib/format";

const SHOW_MS = 12000;
const TOAST_MS = 5000;

export function Toaster() {
  // Every finished task gets its own notice, so finishing three tasks in a row shows three stacked notices.
  const [notices, setNotices] = useState<(FinishedNotice & { key: number })[]>(
    [],
  );
  const [toasts, setToasts] = useState<(Toast & { key: number })[]>([]);

  useEffect(() => {
    const onFinished = (e: Event) => {
      const key = Date.now() + Math.random();
      setNotices((cur) => [
        ...cur.slice(-4),
        { ...(e as CustomEvent<FinishedNotice>).detail, key },
      ]);
      setTimeout(
        () => setNotices((cur) => cur.filter((n) => n.key !== key)),
        SHOW_MS,
      );
    };
    const onToast = (e: Event) => {
      const key = Date.now() + Math.random();
      setToasts((cur) => [
        ...cur.slice(-3),
        { ...(e as CustomEvent<Toast>).detail, key },
      ]);
      setTimeout(
        () => setToasts((cur) => cur.filter((t) => t.key !== key)),
        TOAST_MS,
      );
    };
    window.addEventListener(FINISHED_EVENT, onFinished);
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(FINISHED_EVENT, onFinished);
      window.removeEventListener(TOAST_EVENT, onToast);
    };
  }, []);

  if (!notices.length && !toasts.length) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.key}
          className={`card flex items-center justify-between gap-3 px-3 py-2.5 text-sm shadow-lg ${t.tone === "error" ? "border-red-500/60" : "border-emerald-500/60"}`}
        >
          <div className="min-w-0">
            {/* The icon and the message share one centred line. */}
            <p
              className={`flex items-center gap-2 font-medium ${t.tone === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
            >
              <i className={`pi ${t.tone === "error" ? "pi-times-circle" : "pi-check-circle"} text-sm`} aria-hidden />
              {t.message}
            </p>
            {t.detail && <p className="pl-6 text-xs text-muted">{t.detail}</p>}
            {t.link && (
              <Link
                className="pl-6 text-xs font-medium underline"
                href={t.link.href}
              >
                {t.link.label}
              </Link>
            )}
          </div>
          <Button
            type="button"
            icon="pi pi-times"
            text
            rounded
            size="small"
            severity="secondary"
            aria-label="Dismiss"
            onClick={() =>
              setToasts((cur) => cur.filter((x) => x.key !== t.key))
            }
          />
        </div>
      ))}
      {notices.map((notice) => (
        <div
          key={notice.key}
          className="card space-y-3 border-emerald-500/60 p-4 text-sm shadow-lg"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">
              {notice.inReview ? "✓ Sent for review" : "✓ Task finished"}
            </p>
            <Button
              type="button"
              icon="pi pi-times"
              text
              rounded
              size="small"
              severity="secondary"
              aria-label="Dismiss"
              onClick={() =>
                setNotices((cur) => cur.filter((n) => n.key !== notice.key))
              }
            />
          </div>
          <p>
            <span className="font-medium">{truncate(notice.title, 50)}</span>{" "}
            was moved to{" "}
            {notice.inReview ? (
              <Link className="underline" href="/tasks">
                Open tasks
              </Link>
            ) : (
              <Link className="underline" href="/tasks?show=finished">
                Done
              </Link>
            )}
            .
            {notice.inReview
              ? " Your team lead will approve it or return it with a reason."
              : ""}
          </p>
          {notice.nextTaskId ? (
            <p className="rounded-md bg-emerald-500/10 p-2">
              ↻ A new task was created
              {notice.nextDueDate ? (
                <>
                  {" "}
                  and is due{" "}
                  <span className="font-medium">{notice.nextDueDate}</span>
                </>
              ) : null}
              .{" "}
              <Link
                className="font-medium underline"
                href={`/tasks/${notice.nextTaskId}`}
              >
                Open new task
              </Link>
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
