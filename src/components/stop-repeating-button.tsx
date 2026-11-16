"use client";

import { Button } from "@/components/ui";
import { useTransition } from "react";
import { stopRepeating } from "@/app/actions";

export function StopRepeatingButton({ taskId }: { taskId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      link
      size="small"
      className="p-0"
      disabled={pending}
      onClick={() => startTransition(async () => void (await stopRepeating(taskId)))}
    >
      {pending ? "Stopping…" : "Stop repeating"}
    </Button>
  );
}
