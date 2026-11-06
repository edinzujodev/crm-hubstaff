"use client";

import { useTransition } from "react";
import { stopRepeating } from "@/app/actions";

export function StopRepeatingButton({ taskId }: { taskId: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="underline"
      disabled={pending}
      onClick={() => startTransition(async () => void (await stopRepeating(taskId)))}
    >
      {pending ? "Stopping…" : "Stop repeating"}
    </button>
  );
}
