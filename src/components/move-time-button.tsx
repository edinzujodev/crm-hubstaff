"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveSessionTime } from "@/app/actions";
import { Modal } from "@/components/modal";
import { Button, Select } from "@/components/ui";

export type MoveTarget = { id: number; title: string; label: string };

/**
 * "Move hours" on a finished session: pick another task of the same person and the session's hours (and the
 * Hubstaff time inside it) move there. For when time was tracked on the wrong task.
 */
export function MoveTimeButton({
  sessionId,
  summary,
  targets,
}: {
  sessionId: number;
  /** e.g. "Edin Z. · 16 Nov, 14:00 → 15:10 · 1h 10m" */
  summary: string;
  targets: MoveTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const res = await moveSessionTime(sessionId, Number(to));
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.push(`/tasks/${res.data.toTaskId}`);
    });

  return (
    <>
      <Button
        type="button"
        size="small"
        severity="secondary"
        outlined
        icon="pi pi-arrow-right-arrow-left"
        label="Move hours"
        onClick={() => {
          setTo("");
          setError(null);
          setOpen(true);
        }}
      />
      {open && (
        <Modal title="Move these hours to another task" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-muted">{summary}</p>
            {targets.length === 0 ? (
              <p className="text-sm">This person has no other task to move the hours to.</p>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Move to
                <Select value={to} onChange={(e) => setTo(e.target.value)} className="w-full text-foreground">
                  <option value="">Choose a task…</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {t.label ? ` · ${t.label}` : ""}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <p className="text-xs text-muted">
              Only the CRM changes: reports and totals follow the new task. The time stays on the old task inside the
              Hubstaff app.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" severity="secondary" outlined onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={pending || !to} onClick={submit}>
                {pending ? "Moving…" : "Move hours"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
