import { Suspense } from "react";
import { connection } from "next/server";
import { TabCard } from "@/components/tab-card";
import { UrgencyLevelsForm } from "@/components/urgency-levels-form";
import { TemplateManager } from "@/components/template-manager";
import { pageGuard } from "@/lib/auth";
import { listTemplates } from "@/lib/templates";
import { getLevels } from "@/lib/urgency-settings";

const TABS = [
  { key: "templates", label: "Templates" },
  { key: "urgency", label: "Urgency levels" },
];

async function ConfigContent({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const auth = await pageGuard("super_admin", "leader");
  const wanted = (await searchParams).tab;
  const active = Math.max(0, TABS.findIndex((t) => t.key === wanted));

  return (
    <TabCard
      padded
      active={active}
      tabs={TABS.map((t) => ({ label: t.label, href: t.key === "templates" ? "/config" : `/config?tab=${t.key}` }))}
    >
      {TABS[active].key === "templates" && <TemplateManager templates={await listTemplates()} />}
      {TABS[active].key === "urgency" && <UrgencyTab admin={auth.role === "super_admin"} />}
    </TabCard>
  );
}

async function UrgencyTab({ admin }: { admin: boolean }) {
  const levels = await getLevels();
  return (
    <section className="space-y-5">
      <p className="text-xs text-muted">
        How many hours before its due date a task becomes Critical or Approaching. The same for every team.
      </p>
      {admin ? (
        <UrgencyLevelsForm approachingHours={levels.approachingHours} criticalHours={levels.criticalHours} />
      ) : (
        <p className="text-sm">
          Critical under {levels.criticalHours} hours, Approaching under {levels.approachingHours} hours. Only the super
          admin can change this.
        </p>
      )}
    </section>
  );
}

export default function ConfigPage({ searchParams }: PageProps<"/config">) {
  return (
    <div className="space-y-6">
      <h1 className="sr-only">Config</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <ConfigContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
