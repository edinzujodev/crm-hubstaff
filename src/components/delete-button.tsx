"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ConfirmDelete } from "@/components/confirm-delete";
import { notify } from "@/lib/toast";

/**
 * A Delete button that asks "Are you sure?" in a modal first. Once deleted it shows a notice (with a link to the
 * deleted tasks when `deletedLink` is set) and goes to `redirectTo`.
 */
export function DeleteButton({
  title,
  what,
  note,
  redirectTo,
  deletedLink,
  action,
}: {
  /** The modal's heading, e.g. "Delete task?". */
  title: string;
  /** The name of what is deleted. */
  what: string;
  note?: string;
  redirectTo?: string;
  deletedLink?: boolean;
  action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="small" severity="danger" icon="pi pi-trash" label="Delete" onClick={() => setOpen(true)} />
      {open && (
        <ConfirmDelete
          title={title}
          what={what}
          note={note}
          onClose={() => setOpen(false)}
          action={async () => {
            const res = await action();
            if (!res.ok) return res;
            notify({ message: "Deleted", detail: what, link: deletedLink ? { href: "/tasks?show=deleted", label: "Open Deleted" } : undefined });
            const d = res.data;
            if (d && typeof d === "object" && "hubstaffError" in d && d.hubstaffError) {
              notify({ message: "Deleted in the CRM, but Hubstaff could not be updated", detail: String(d.hubstaffError), tone: "error" });
            }
            if (redirectTo) router.push(redirectTo);
            return res;
          }}
        />
      )}
    </>
  );
}
