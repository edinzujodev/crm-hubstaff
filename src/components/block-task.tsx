"use client";

import { Button, InputTextarea } from "@/components/ui";
import { useState, useTransition } from "react";
import { setBlocked } from "@/app/actions";
import { Modal } from "@/components/modal";

/** Asks why a task is blocked (the reason is optional), then marks it blocked. */
export function BlockModal({ taskId, title, onDone }: { taskId: number; title: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal title="Mark as blocked" onClose={onDone}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await setBlocked(taskId, true, reason);
            if (!res.ok) return setError(res.error);
            onDone();
          });
        }}
      >
        <p className="text-sm">
          <span className="font-medium">{title}</span> can&apos;t move on right now.
        </p>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Why is it blocked? (optional)
          <InputTextarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            autoFocus
            placeholder="e.g. Waiting for the client's bank statements"
            className="w-full text-foreground"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" severity="secondary" outlined onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending}>{pending ? "Saving…" : "Mark as blocked"}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** On the task page: Mark as blocked (asks for an optional reason), or Unblock when it already is. */
export function BlockTaskButton({ taskId, title, blocked }: { taskId: number; title: string; blocked: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (blocked)
    return (
      <Button
        type="button"
        size="small"
        severity="secondary"
        outlined
        disabled={pending}
        onClick={() => start(async () => void (await setBlocked(taskId, false)))}
      >
        {pending ? "Unblocking…" : "Unblock"}
      </Button>
    );
  return (
    <>
      <Button type="button" size="small" severity="secondary" outlined onClick={() => setOpen(true)}>
        Mark as blocked
      </Button>
      {open && <BlockModal taskId={taskId} title={title} onDone={() => setOpen(false)} />}
    </>
  );
}
