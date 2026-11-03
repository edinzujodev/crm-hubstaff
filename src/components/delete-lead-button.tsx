"use client";

import { deleteLead } from "@/app/actions";
import { HoldToDelete } from "@/components/hold-to-delete";

export function DeleteLeadButton({ leadId, title, redirectTo }: { leadId: number; title: string; redirectTo?: string }) {
  return <HoldToDelete title={title} redirectTo={redirectTo} action={() => deleteLead(leadId)} />;
}
