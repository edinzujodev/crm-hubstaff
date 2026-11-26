"use client";

import { deleteLead } from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";

export function DeleteLeadButton({ leadId, title, redirectTo }: { leadId: number; title: string; redirectTo?: string }) {
  return <DeleteButton title="Delete lead?" what={title} redirectTo={redirectTo} action={() => deleteLead(leadId)} />;
}
