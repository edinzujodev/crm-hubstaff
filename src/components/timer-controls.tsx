"use client";

import { useEffect, useState, useTransition } from "react";
import { finishTask, startTask } from "@/app/actions";
import { helper } from "@/lib/helper-client";

type Props = {
  taskId: number;
  done: boolean;
  /** Start time of the current user's open session on this task, if any. */
  runningSince: string | null;
  /** The current user's open session on another task, if any. */
  otherTask: { id: number; title: string } | null;
  compact?: boolean;
};

function elapsed(since: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function TimerControls({ taskId, done, runningSince, otherTask, compact }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!runningSince) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [runningSince]);

  const onStart = () =>
    startTransition(async () => {
      setMessage(null);
      const res = await startTask(taskId);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      const h = await helper.start(res.data.hubstaffTaskId);
      if (h.ok) setMessage({ tone: "ok", text: "Hubstaff timer started." });
      else if (h.reason === "not_running")
        setMessage({
          tone: "warn",
          text: `Session started. The Hubstaff helper isn't running, so start task #${res.data.hubstaffTaskId} in the Hubstaff app.`,
        });
      else setMessage({ tone: "warn", text: `Session started, but the helper said: ${h.detail ?? "error"}. Start the task in Hubstaff.` });
    });

  const onFinish = () =>
    startTransition(async () => {
      setMessage(null);
      const h = await helper.stop();
      const res = await finishTask();
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      const parts = [h.ok ? "Hubstaff timer stopped." : "Session finished. Stop the timer in the Hubstaff app if it's still running."];
      if (res.data.syncError) parts.push(`Sync failed: ${res.data.syncError}`);
      else parts.push("Hours synced; Hubstaff can take up to ~20 min to report the last minutes.");
      setMessage({ tone: h.ok && !res.data.syncError ? "ok" : "warn", text: parts.join(" ") });
    });

  const toneClass = {
    ok: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    error: "text-red-700 dark:text-red-400",
  };

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-2"}>
      <div className="flex items-center gap-2">
        {runningSince ? (
          <>
            <span suppressHydrationWarning className="font-mono text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
              ● {elapsed(runningSince)}
            </span>
            <button onClick={onFinish} disabled={pending} className="btn btn-danger">
              {pending ? "…" : "Finish"}
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            disabled={pending || done}
            className="btn btn-primary"
            title={otherTask ? `Stops your session on "${otherTask.title}"` : undefined}
          >
            {pending ? "…" : otherTask ? "Switch here" : "Start"}
          </button>
        )}
      </div>
      {message && !compact && <p className={`text-sm ${toneClass[message.tone]}`}>{message.text}</p>}
      {message && compact && message.tone !== "ok" && (
        <span className={`text-xs ${toneClass[message.tone]}`} title={message.text}>
          ⚠
        </span>
      )}
    </div>
  );
}
