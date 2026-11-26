"use client";

import { Button } from "@/components/ui";
import { useTransition } from "react";
import { restoreTask } from "@/app/actions";
import { notify } from "@/lib/toast";

export function RestoreTaskButton({ taskId, title, compact }: { taskId: number; title?: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className={`${compact ? "py-1" : ""}`}
      severity="info"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await restoreTask(taskId);
          if (!res.ok) notify({ message: "Couldn't restore the task", detail: res.error, tone: "error" });
          else notify({ message: "Task restored", detail: title });
          if (res.ok && res.data.hubstaffError)
            notify({ message: "Restored in the CRM, but Hubstaff could not be updated", detail: res.data.hubstaffError, tone: "error" });
        })
      }
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
