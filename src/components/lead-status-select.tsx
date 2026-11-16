"use client";

import { Select } from "@/components/ui";
import { useTransition } from "react";
import { setLeadStatus } from "@/app/actions";

type Status = "new" | "contacted" | "meeting" | "proposal" | "lost";

export function LeadStatusSelect({ leadId, status }: { leadId: number; status: Status }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      aria-label="Lead status"
      className="w-full "
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await setLeadStatus(leadId, e.target.value as Status);
          if (!res.ok) alert(res.error);
        })
      }
    >
      <option value="new">New</option>
      <option value="contacted">Contacted</option>
      <option value="meeting">Meeting</option>
      <option value="proposal">Proposal sent</option>
      <option value="lost">Lost</option>
    </Select>
  );
}
