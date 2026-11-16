import { Suspense } from "react";
import { connection } from "next/server";
import { TemplateManager } from "@/components/template-manager";
import { pageGuard } from "@/lib/auth";
import { listTemplates } from "@/lib/templates";

async function TemplateContent() {
  await connection();
  await pageGuard("super_admin", "leader");
  return <TemplateManager templates={await listTemplates()} />;
}

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Templates</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <TemplateContent />
      </Suspense>
    </div>
  );
}
