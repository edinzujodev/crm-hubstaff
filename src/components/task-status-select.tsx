"use client";

import { useTransition } from "react";
import { setTaskStatus } from "@/app/actions";
import { notifyFinished } from "@/lib/toast";

type Status = "todo" | "in_progress" | "done" | "review";

export function TaskStatusSelect({ taskId, title, status }: { taskId: number; title: string; status: Status }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Status"
      className="input"
      value={status === "done" ? "done" : status === "review" ? "review" : "todo"}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const value = e.target.value as "todo" | "done";
          const res = await setTaskStatus(taskId, value);
          if (res.ok && value === "done") notifyFinished({ taskId, title, ...res.data });
        })
      }
    >
      <option value="todo">Open</option>
      {status === "review" && (
        <option value="review" disabled>
          On review
        </option>
      )}
      <option value="done">Done</option>
    </select>
  );
}
