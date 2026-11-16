"use client";

import { Button } from "@/components/ui";
import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";

/** "Delete X?" popup. Shows the server's reason when it refuses (a project with tasks, for example). */
export function ConfirmDelete({
  title,
  what,
  note,
  action,
  onClose,
}: {
  title: string;
  what: string;
  note?: string;
  action: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm">
        Delete <span className="font-medium">{what}</span>?
      </p>
      {note && <p className="text-sm text-muted">{note}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" severity="secondary" outlined onClick={onClose} disabled={pending}>
          {error ? "Close" : "Cancel"}
        </Button>
        {!error && (
          <Button
            type="button"
            severity="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await action();
                if (res.ok) onClose();
                else setError(res.error ?? "Could not delete.");
              })
            }
          >
            {pending ? "Deleting…" : "Delete"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
