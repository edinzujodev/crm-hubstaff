"use client";

import { Button } from "@/components/ui";
import { useTransition } from "react";
import { setTaskStatus } from "@/app/actions";
import { notify } from "@/lib/toast";

/** Puts a finished task back in the Open list. */
export function ReopenTaskButton({ taskId, title, compact }: { taskId: number; title: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      className={compact ? "py-1" : ""}
      severity="secondary"
      outlined
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setTaskStatus(taskId, "todo");
          if (!res.ok) return alert(res.error);
          notify({ message: "Task reopened", detail: title, link: { href: "/tasks", label: "Open list" } });
        })
      }
    >
      {pending ? "Reopening…" : "Reopen"}
    </Button>
  );
}
