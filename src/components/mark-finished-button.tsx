"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setTaskStatus } from "@/app/actions";

/** Marks the task done. If it repeats, the next copy is created and linked. */
export function MarkFinishedButton({ taskId, repeats }: { taskId: number; repeats: boolean }) {
  const [pending, startTransition] = useTransition();
  const [nextId, setNextId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onClick = () =>
    startTransition(async () => {
      setError(null);
      const res = await setTaskStatus(taskId, "done");
      if (!res.ok) return setError(res.error);
      setNextId(res.data.nextTaskId);
    });

  return (
    <div className="space-y-1">
      <button type="button" className="btn btn-primary" disabled={pending} onClick={onClick}>
        {pending ? "…" : repeats ? "Mark finished & create next" : "Mark finished"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {nextId && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Next task created:{" "}
          <Link className="underline" href={`/tasks/${nextId}`}>
            open it
          </Link>
        </p>
      )}
    </div>
  );
}
