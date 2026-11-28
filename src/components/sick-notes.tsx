"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteTimeOffDocument } from "@/app/hr/actions";
import { useConfirm } from "@/components/confirm-modal";
import { Button } from "@/components/ui";
import type { TimeOffDocument } from "@/lib/time-off-documents";
import { notify } from "@/lib/toast";

const MAX_BYTES = 8 * 1024 * 1024;

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * The files attached to sick leave (a doctor's note), each opening in a new tab, and with `canEdit` a button to attach
 * another and a cross to remove one. `compact`: just the files and a small attach link, for a table cell.
 */
export function SickNotes({
  timeOffId,
  documents,
  canEdit,
  compact = false,
}: {
  timeOffId: number;
  documents: TimeOffDocument[];
  canEdit: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, startRemoving] = useTransition();
  const [ask, confirmModal] = useConfirm();

  async function upload(file: File) {
    if (file.size > MAX_BYTES) {
      notify({ message: "That file is too big", detail: "8 MB at most.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch(`/api/time-off/${timeOffId}/documents`, { method: "POST", body: data });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        notify({ message: "Couldn't attach the file", detail: body.error ?? "Try again.", tone: "error" });
        return;
      }
      notify({ message: "Sick note attached" });
      router.refresh();
    } catch {
      notify({ message: "Couldn't attach the file", detail: "Check your connection and try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: TimeOffDocument) {
    const sure = await ask({ title: "Remove this file?", message: `${doc.fileName} is deleted.`, confirmLabel: "Remove" });
    if (!sure) return;
    startRemoving(async () => {
      const r = await deleteTimeOffDocument(doc.id);
      notify(r.ok ? { message: "File removed" } : { message: "Couldn't remove the file", detail: r.error, tone: "error" });
      if (r.ok) router.refresh();
    });
  }

  if (!canEdit && !documents.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 ${removing ? "opacity-60" : ""}`}>
      {documents.map((d) => (
        <span
          key={d.id}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface py-1 pl-2 pr-1 text-xs"
        >
          <i className={`pi ${d.contentType === "application/pdf" ? "pi-file-pdf" : "pi-image"} text-muted`} aria-hidden />
          <a
            href={`/api/time-off/documents/${d.id}`}
            target="_blank"
            rel="noopener"
            className="max-w-48 truncate font-medium hover:underline"
            title={`Open ${d.fileName}`}
          >
            {d.fileName}
          </a>
          {!compact && <span className="text-muted">{fmtSize(d.size)}</span>}
          {canEdit && (
            <button
              type="button"
              onClick={() => void remove(d)}
              disabled={removing}
              aria-label={`Remove ${d.fileName}`}
              title="Remove"
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-muted hover:bg-foreground/5 hover:text-red-600"
            >
              <i className="pi pi-times text-[10px]" aria-hidden />
            </button>
          )}
        </span>
      ))}
      {canEdit && !documents.length && !compact && (
        <span className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <i className="pi pi-exclamation-circle text-xs" aria-hidden />
          No sick note yet
        </span>
      )}
      {canEdit &&
        (compact ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="cursor-pointer text-xs text-muted hover:text-foreground hover:underline"
          >
            {busy ? "Attaching…" : documents.length ? "+ Add file" : "+ Attach sick note"}
          </button>
        ) : (
          <Button
            type="button"
            size="small"
            outlined
            severity="secondary"
            icon="pi pi-paperclip"
            label={busy ? "Attaching…" : documents.length ? "Add another file" : "Attach sick note"}
            disabled={busy}
            onClick={() => input.current?.click()}
          />
        ))}
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      {confirmModal}
    </div>
  );
}
