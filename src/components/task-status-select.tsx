"use client";

import { useTransition } from "react";
import { setTaskStatus } from "@/app/actions";

type Status = "todo" | "in_progress" | "done";

export function TaskStatusSelect({ taskId, status }: { taskId: number; status: Status }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Status"
      className="input"
      value={status}
      disabled={pending}
      onChange={(e) => startTransition(async () => void (await setTaskStatus(taskId, e.target.value as Status)))}
    >
      <option value="todo">To do</option>
      <option value="in_progress">In progress</option>
      <option value="done">Done</option>
    </select>
  );
}
