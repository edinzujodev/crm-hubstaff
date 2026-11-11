"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteLead } from "@/app/actions";
import { ConfirmDelete } from "@/components/confirm-delete";
import { RowMenu } from "@/components/row-menu";

/** Edit / Delete for a lead in the list. Edit opens its page; a lead that became a client can't be deleted. */
export function LeadMenu({ leadId, name, converted }: { leadId: number; name: string; converted: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <RowMenu
        label={`Actions for ${name}`}
        items={[
          { label: "Edit", onSelect: () => router.push(`/leads/${leadId}`) },
          ...(converted ? [] : [{ label: "Delete", danger: true, onSelect: () => setConfirm(true) }]),
        ]}
      />
      {confirm && (
        <ConfirmDelete title="Delete lead?" what={name} action={() => deleteLead(leadId)} onClose={() => setConfirm(false)} />
      )}
    </>
  );
}
