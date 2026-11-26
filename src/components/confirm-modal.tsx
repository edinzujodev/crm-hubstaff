"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";

export type ConfirmOptions = {
  /** The modal's heading, e.g. "Delete event?". */
  title: string;
  /** What will happen, in a sentence or two. */
  message: React.ReactNode;
  /** The button that goes ahead, e.g. "Delete". */
  confirmLabel: string;
  /** "danger" (red) for deleting, removing and cancelling; "primary" for everything else. */
  tone?: "danger" | "primary";
  /** The button that backs out. */
  cancelLabel?: string;
};

/**
 * An "Are you sure?" modal used like `window.confirm`, but in the app's own style:
 *
 *   const [ask, confirmModal] = useConfirm();
 *   if (!(await ask({ title: "Delete event?", message: "…", confirmLabel: "Delete" }))) return;
 *   …
 *   return <>{…}{confirmModal}</>;
 */
export function useConfirm() {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((options: ConfirmOptions) => {
    // A second question replaces one still open: that one counts as "no".
    resolver.current?.(false);
    setOpen(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(null);
  }, []);

  const modal = open ? <ConfirmModal {...open} onAnswer={answer} /> : null;
  return [ask, modal] as const;
}

function ConfirmModal({ title, message, confirmLabel, tone = "danger", cancelLabel = "Cancel", onAnswer }: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  return (
    <Modal title={title} onClose={() => onAnswer(false)}>
      <div className="text-sm">{message}</div>
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined label={cancelLabel} onClick={() => onAnswer(false)} />
        <Button type="button" severity={tone === "danger" ? "danger" : undefined} label={confirmLabel} autoFocus onClick={() => onAnswer(true)} />
      </div>
    </Modal>
  );
}
