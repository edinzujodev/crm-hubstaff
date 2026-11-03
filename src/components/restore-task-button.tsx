"use client";

import { useTransition } from "react";
import { restoreTask } from "@/app/actions";

export function RestoreTaskButton({ taskId, compact }: { taskId: number; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className={`btn ${compact ? "py-1" : ""}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await restoreTask(taskId);
          if (!res.ok) alert(res.error);
          else if (res.data.hubstaffError) alert(`Restored in the CRM, but Hubstaff could not be updated: ${res.data.hubstaffError}`);
        })
      }
    >
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
