"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { convertLead } from "@/app/actions";

export function ConvertLeadButton({ leadId, name, compact }: { leadId: number; name: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      className={`btn btn-primary ${compact ? "py-1" : ""}`}
      disabled={pending}
      title={`Create a client from ${name}`}
      onClick={() =>
        startTransition(async () => {
          const res = await convertLead(leadId);
          if (!res.ok) alert(res.error);
          else router.push(`/clients/${res.data.clientId}`);
        })
      }
    >
      {pending ? "Converting…" : "Convert to client"}
    </button>
  );
}
