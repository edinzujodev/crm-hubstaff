"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSeries, stopRepeating } from "@/app/actions";
import { Modal } from "@/components/modal";
import { truncate } from "@/lib/format";

/** Stop repeating and Delete for a whole recurring task. Delete asks first and says how many copies go. */
export function SeriesActions({
  seriesId,
  latestTaskId,
  title,
  repeating,
  count,
}: {
  seriesId: number;
  latestTaskId: number;
  title: string;
  repeating: boolean;
  count: number;
}) {
  const router = useRouter();
  const [stopping, startStop] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const onDelete = () =>
    startDelete(async () => {
      setError(null);
      const res = await deleteSeries(seriesId);
      if (!res.ok) return setError(res.error);
      if (res.data.hubstaffError) return setWarning(res.data.hubstaffError);
      router.push("/tasks?show=recurring");
    });

  return (
    <>
      {repeating && (
        <span title="No more copies will be created after the current one">
          <Button
            type="button"
            size="small"
            severity="secondary"
            outlined
            disabled={stopping}
            onClick={() => startStop(async () => void (await stopRepeating(latestTaskId)))}
          >
            {stopping ? "Stopping…" : "Stop repeating"}
          </Button>
        </span>
      )}
      <Button type="button" size="small" severity="danger" onClick={() => setOpen(true)}>
        Delete
      </Button>

      {open && (
        <Modal title="Delete recurring task?" onClose={() => setOpen(false)}>
          {warning ? (
            <div className="space-y-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Deleted in the CRM, but a Hubstaff task could not be marked ({warning}).
              </p>
              <div className="flex justify-end">
                <Button severity="secondary" outlined onClick={() => router.push("/tasks?show=recurring")}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">
                Are you sure you want to delete all <span className="font-semibold">{count}</span>{" "}
                {count === 1 ? "occurrence" : "occurrences"} of{" "}
                <span className="font-medium">{truncate(title, 50)}</span>?
              </p>
              <p className="text-sm text-muted">
                Every copy is hidden from the task list, any running timer on them is stopped and no new copies are
                made. Their hours are left out of the reports, and each copy can be restored from the Deleted tab.
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" severity="secondary" outlined onClick={() => setOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button type="button" severity="danger" onClick={onDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : `Delete all ${count}`}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
