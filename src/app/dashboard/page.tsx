import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DashboardGrid, type GridItem } from "@/components/dashboard/dashboard-grid";
import type { Lookups } from "@/components/dashboard/widget-form";
import { WidgetBody } from "@/components/dashboard/widgets";
import { getAuth } from "@/lib/auth";
import { WIDGETS, isRows, isSize, isWidgetType, parseConfig, type AnyConfig, type WidgetType } from "@/lib/dashboard/config";
import { getWidgets } from "@/lib/dashboard/data";
import { autoTitle, getDirectory, resolveScope } from "@/lib/dashboard/scope";

export const metadata = { title: "Dashboard · Client tracker" };

async function Dashboard() {
  await connection();
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const [rows, dir] = await Promise.all([getWidgets(auth), getDirectory()]);

  // What the pickers offer is narrowed to the role here; the server actions check it again on save.
  const ledId = auth.ledTeam?.id;
  const lookups: Lookups = {
    people:
      auth.role === "super_admin"
        ? dir.users
        : auth.role === "leader"
          ? dir.users.filter((u) => u.teamId === ledId || u.id === auth.user.id)
          : [],
    teams: auth.role === "super_admin" ? dir.teams : auth.role === "leader" ? dir.teams.filter((t) => t.id === ledId) : [],
    clients: auth.role === "worker" ? [] : dir.clients,
  };

  const items: GridItem[] = await Promise.all(
    rows
      .filter((r) => isWidgetType(r.type))
      .map(async (r) => {
        const type = r.type as WidgetType;
        const config = parseConfig(type, r.config) as AnyConfig;
        const hasWho = WIDGETS[type].fields.some((f) => f.kind === "who");
        const owner = hasWho ? (await resolveScope(auth, config as { who: string; userId: number | null; teamId: number | null })).owner : "";
        return {
          id: r.id,
          type,
          size: isSize(r.size) ? r.size : WIDGETS[type].defaultSize,
          rows: isRows(r.rows) ? r.rows : 1,
          title: r.title || autoTitle(type, config, owner, dir),
          customTitle: r.title,
          config,
          body: (
            <Suspense fallback={<p className="py-6 text-center text-sm text-muted">Loading…</p>}>
              <WidgetBody type={type} raw={r.config} auth={auth} />
            </Suspense>
          ),
        };
      }),
  );

  return <DashboardGrid items={items} role={auth.role} lookups={lookups} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<h1 className="sr-only">Dashboard</h1>}>
      <Dashboard />
    </Suspense>
  );
}
