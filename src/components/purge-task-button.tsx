"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { purgeTask } from "@/app/actions";
import { Modal } from "@/components/modal";
import { truncate } from "@/lib/format";

/** "Delete" (for good) for a task in the Deleted list. It asks first, because it can't be undone. */
export function PurgeTaskButton({
  taskId,
  title,
  compact,
  redirectTo,
}: {
  taskId: number;
  title: string;
  compact?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        type="button"
        className={compact ? "py-1" : ""}
        severity="danger"
        onClick={() => setOpen(true)}
      >
        Delete
      </Button>
      {open && (
        <Modal title="Delete task?" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm">
              Permanently delete <span className="font-medium">{truncate(title, 50)}</span>?
            </p>
            <p className="text-sm text-muted">
              This can&apos;t be undone. Its sessions, checklist and reviews are removed. Its hours are already left out of
              the reports, and they stay in Hubstaff.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" severity="secondary" outlined onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="button"
                severity="danger"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await purgeTask(taskId);
                    if (!res.ok) return setError(res.error);
                    setOpen(false);
                    if (redirectTo) router.push(redirectTo);
                  })
                }
              >
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
