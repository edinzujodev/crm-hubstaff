"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { notify } from "@/lib/toast";

const HOLD_MS = 1200;

/** Press and hold to delete: the button fills up, and releasing early cancels. */
export function HoldToDelete({
  title,
  redirectTo,
  action,
}: {
  title: string;
  redirectTo?: string;
  action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>;
}) {
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
        const res = await action();
        if (!res.ok) {
          setHolding(false);
          alert(res.error ?? "Could not delete.");
        } else {
          notify({ message: "Deleted", detail: title, link: { href: "/tasks?show=deleted", label: "Open Deleted" } });
          const d = res.data;
          if (d && typeof d === "object" && "hubstaffError" in d) {
            alert(`Deleted in the CRM, but Hubstaff could not be updated: ${String(d.hubstaffError)}`);
          }
          if (redirectTo) router.push(redirectTo);
        }
      });
    }, HOLD_MS);
  };

  return (
    <Button
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
      className="relative touch-none select-none overflow-hidden whitespace-nowrap"
      severity="danger"
      size="small"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-black/30"
        style={{
          width: holding || pending ? "100%" : "0%",
          transition: holding && !pending ? `width ${HOLD_MS}ms linear` : "width 150ms ease-out",
        }}
      />
      <span className="relative whitespace-nowrap">{pending ? "Deleting…" : holding ? "Keep holding…" : "Hold to delete"}</span>
    </Button>
  );
}
