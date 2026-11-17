"use client";

import { Button } from "@/components/ui";
import { useTransition } from "react";
import { restoreTask } from "@/app/actions";
import { notify } from "@/lib/toast";

export function RestoreTaskButton({ taskId, compact }: { taskId: number; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className={`${compact ? "py-1" : ""}`}
      severity="info"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await restoreTask(taskId);
          if (!res.ok) alert(res.error);
          else notify({ message: "Task restored" });
          if (res.ok && res.data.hubstaffError)
            alert(`Restored in the CRM, but Hubstaff could not be updated: ${res.data.hubstaffError}`);
        })
      }
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}
