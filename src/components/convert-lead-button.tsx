"use client";

import { notify } from "@/lib/toast";
import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { convertLead } from "@/app/actions";

export function ConvertLeadButton({ leadId, name, compact }: { leadId: number; name: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      className={`${compact ? "py-1" : ""}`}
      disabled={pending}
      title={`Create a client from ${name}`}
      onClick={() =>
        startTransition(async () => {
          const res = await convertLead(leadId);
          if (!res.ok) notify({ message: "Couldn't convert the lead", detail: res.error, tone: "error" });
          else router.push(`/clients/${res.data.clientId}`);
        })
      }
    >
      {pending ? "Converting…" : "Convert to client"}
    </Button>
  );
}
