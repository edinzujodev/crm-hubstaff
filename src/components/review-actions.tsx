"use client";

import { Button, InputTextarea } from "@/components/ui";
import { useState, useTransition } from "react";
import { approveTask, rejectTask } from "@/app/actions";
import { Modal } from "@/components/modal";

/** Approve or deny a task that is waiting for review. Denying needs a reason, which the assignee will see. */
export function ReviewActions({ taskId, title }: { taskId: number; title: string }) {
  const [pending, start] = useTransition();
  const [deny, setDeny] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = () =>
    start(async () => {
      const res = await approveTask(taskId);
      setError(res.ok ? null : res.error);
    });
  const submitDeny = () =>
    start(async () => {
      const res = await rejectTask(taskId, reason);
      if (res.ok) {
        setDeny(false);
        setReason("");
        setError(null);
      } else setError(res.error);
    });

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" size="small" severity="success" className="w-20 justify-center" disabled={pending} onClick={approve}>
          Approve
        </Button>
        <Button type="button" size="small" severity="danger" className="w-20 justify-center" disabled={pending} onClick={() => setDeny(true)}>
          Deny
        </Button>
        {error && !deny && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {deny && (
        <Modal title="Deny this task?" onClose={() => setDeny(false)}>
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{title}</span> goes back to its assignee marked “checked, not OK”.
            </p>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Why is it not OK?
              <InputTextarea
                autoResize={false}
                style={{ width: "100%" }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                autoFocus
                required
                className="text-foreground"
                placeholder="What needs to be fixed"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" severity="secondary" outlined onClick={() => setDeny(false)}>
                Cancel
              </Button>
              <Button type="button" severity="danger" disabled={pending || !reason.trim()} onClick={submitDeny}>
                {pending ? "Sending…" : "Send back"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
