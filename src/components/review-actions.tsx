"use client";

import { Button, InputTextarea } from "@/components/ui";
import { useState, useTransition } from "react";
import { approveTask, rejectTask } from "@/app/actions";
import { Modal } from "@/components/modal";
import { notify } from "@/lib/toast";

/** Approve or return a task that is waiting for review. Returning needs a reason, which the assignee will see. */
export function ReviewActions({ taskId, title }: { taskId: number; title: string }) {
  const [pending, start] = useTransition();
  const [deny, setDeny] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = () =>
    start(async () => {
      const res = await approveTask(taskId);
      setError(res.ok ? null : res.error);
      if (res.ok) notify({ message: "Task approved", detail: title, link: { href: "/tasks?show=finished", label: "Open Finished" } });
    });
  const submitDeny = () =>
    start(async () => {
      const res = await rejectTask(taskId, reason);
      if (res.ok) {
        notify({ message: "Task returned", detail: `${title} goes back to its assignee with your reason.` });
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
          Return
        </Button>
        {error && !deny && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {deny && (
        <Modal title="Return this task?" onClose={() => setDeny(false)}>
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{title}</span> goes back to its assignee marked “Returned”.
            </p>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Why are you returning it?
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
                {pending ? "Returning…" : "Return"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
