"use client";

import { useCallback, useState } from "react";
import { deleteLead } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { LeadEditForm } from "@/components/lead-edit-form";
import { Modal } from "@/components/modal";
import { RowMenu } from "@/components/row-menu";
import type { Lead } from "@/db/schema";

/** Edit / Delete for a lead in the list. Edit opens a popup; a lead that became a client can't be deleted. */
export function LeadMenu({ lead, users }: { lead: Lead; users: { id: number; name: string }[] }) {
  const [modal, setModal] = useState<"edit" | "delete" | null>(null);
  const close = useCallback(() => setModal(null), []);
  const converted = lead.status === "won";
  return (
    <>
      <RowMenu
        label={`Actions for ${lead.name}`}
        items={[
          { label: "Edit", onSelect: () => setModal("edit") },
          ...(converted ? [] : [{ label: "Delete", danger: true, onSelect: () => setModal("delete") }]),
        ]}
      />
      {modal === "edit" && (
        <Modal title="Edit lead" wide onClose={close}>
          <LeadEditForm lead={lead} users={users} onDone={close} />
        </Modal>
      )}
      {modal === "delete" && (
        <ConfirmDelete title="Delete lead?" what={lead.name} action={() => deleteLead(lead.id)} onClose={close} />
      )}
    </>
  );
}
