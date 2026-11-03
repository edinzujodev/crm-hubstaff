"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteTask } from "@/app/actions";

const HOLD_MS = 1200;

/** Press and hold to delete: the button fills up, and releasing early cancels. */
export function DeleteTaskButton({ taskId, title, redirectTo }: { taskId: number; title: string; redirectTo?: string }) {
  const [pending, startTransition] = useTransition();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);

  const begin = () => {
    if (pending || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      startTransition(async () => {
        const res = await deleteTask(taskId);
        if (!res.ok) {
          setHolding(false);
          alert(res.error);
        } else if (redirectTo) router.push(redirectTo);
      });
    }, HOLD_MS);
  };

  return (
    <button
      type="button"
      title={`Hold to delete "${title}"`}
      aria-label={`Hold to delete ${title}`}
      disabled={pending}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) begin();
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className="btn relative select-none overflow-hidden text-red-600 touch-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-red-500/35"
        style={{
          width: holding || pending ? "100%" : "0%",
          transition: holding && !pending ? `width ${HOLD_MS}ms linear` : "width 150ms ease-out",
        }}
      />
      <span className="relative">{pending ? "Deleting…" : holding ? "Keep holding…" : "Hold to delete"}</span>
    </button>
  );
}
