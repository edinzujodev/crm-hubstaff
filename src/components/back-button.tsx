"use client";

import { Button } from "@/components/ui";
import { useRouter } from "next/navigation";

/** Goes back to the page the person came from; opens `fallback` when the page was opened directly. */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      outlined
      severity="secondary"
      className="!border-border !bg-surface !text-foreground hover:!bg-background"
      icon="pi pi-arrow-left"
      label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
    />
  );
}
