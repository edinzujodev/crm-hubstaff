import "dotenv/config";
import { db, schema } from "@/db";
import { hubstaffMode } from "@/lib/config";
import { MOCK_EXTRA_ACTIVITIES_KEY, MOCK_PROJECT_ID } from "@/lib/hubstaff/mock";
import type { HubstaffActivityDto } from "@/lib/hubstaff/types";
import { syncHubstaff } from "@/lib/sync";
import { sql } from "drizzle-orm";

const HOUR = 60 * 60 * 1000;
const SLOT = 10 * 60 * 1000;

async function main() {
  const mock = hubstaffMode() === "mock";
  if (!mock && !process.argv.includes("--yes")) {
    console.error("Live mode: seeding wipes all CRM data. Run `npm run db:seed -- --yes` if that's what you want.");
    process.exit(1);
  }
  await db.execute(
    sql`truncate hubstaff_activities, work_sessions, tasks, clients, users, app_state restart identity cascade`,
  );

  // Demo people. In live mode set hubstaff_user_id to their real Hubstaff ids on the Team page.
  const [amra, edin, lejla] = await db
    .insert(schema.users)
    .values([
      { name: "Amra K.", email: "amra@example.com", hubstaffUserId: mock ? 5001 : null },
      { name: "Edin Z.", email: "edin@example.com", hubstaffUserId: mock ? 5002 : null },
      { name: "Lejla M.", email: "lejla@example.com", hubstaffUserId: mock ? 5003 : null },
    ])
    .returning();

  const [northwind, bluebird, harbor] = await db
    .insert(schema.clients)
    .values([{ name: "Northwind Dental LLC" }, { name: "Bluebird Logistics Inc." }, { name: "Harbor Street Cafe" }])
    .returning();

  const today = new Date().toISOString().slice(0, 10);
  const tasks = await db
    .insert(schema.tasks)
    .values([
      { title: "Monthly bank reconciliation", clientId: northwind.id, assigneeId: amra.id, dueDate: today },
      { title: "Payroll review (bi-weekly)", clientId: bluebird.id, assigneeId: lejla.id, dueDate: today },
      { title: "Categorize uncategorized transactions", clientId: harbor.id, assigneeId: edin.id },
      { title: "Quarterly sales tax filing prep", clientId: northwind.id, assigneeId: edin.id },
      { title: "2024 cleanup: reconcile credit cards", clientId: bluebird.id, assigneeId: amra.id },
    ])
    .returning();

  if (mock) {
    const now = Date.now();
    const at = (hoursAgo: number) => new Date(Math.floor((now - hoursAgo * HOUR) / 60000) * 60000);
    const [recon, payroll] = tasks;

    // Pretend these two were already started once, so they exist in "Hubstaff".
    for (const t of [recon, payroll]) {
      await db
        .update(schema.tasks)
        .set({ hubstaffTaskId: 800000 + t.id, hubstaffProjectId: MOCK_PROJECT_ID, status: "in_progress" })
        .where(sql`id = ${t.id}`);
    }

    await db.insert(schema.workSessions).values([
      // Several Start/Finish cycles on one task: they are summed.
      { taskId: recon.id, userId: amra.id, startedAt: at(28), endedAt: at(26.5), endReason: "finished" },
      { taskId: recon.id, userId: amra.id, startedAt: at(25), endedAt: at(24.2), endReason: "finished" },
      { taskId: recon.id, userId: amra.id, startedAt: at(3), endedAt: at(2), endReason: "switched" },
      // Forgotten Finish: open for 9 hours, Hubstaff's idle timeout stopped tracking after ~3h.
      { taskId: payroll.id, userId: lejla.id, startedAt: at(9) },
    ]);

    // Fixture activities that don't come from CRM sessions.
    const extra: HubstaffActivityDto[] = [];
    const slotStart = (hoursAgo: number) => Math.floor((now - hoursAgo * HOUR) / SLOT) * SLOT;
    // 50 min on the payroll task, tracked straight from the Hubstaff app (no CRM Start).
    for (let i = 0; i < 5; i++) {
      const id = 9_000_000 + i;
      extra.push({
        id,
        starts_at: new Date(slotStart(30) + i * SLOT).toISOString(),
        user_id: 5003,
        project_id: MOCK_PROJECT_ID,
        task_id: 800000 + payroll.id,
        tracked: 600,
        overall: 420,
        billable: true,
      });
    }
    // 1 hour on a Hubstaff task the CRM doesn't know about: shows up as unmatched time.
    for (let i = 0; i < 6; i++) {
      extra.push({
        id: 9_100_000 + i,
        starts_at: new Date(slotStart(20) + i * SLOT).toISOString(),
        user_id: 5002,
        project_id: MOCK_PROJECT_ID,
        task_id: 799999,
        tracked: 600,
        overall: 300,
        billable: true,
      });
    }
    await db.insert(schema.appState).values({ key: MOCK_EXTRA_ACTIVITIES_KEY, value: JSON.stringify(extra) });

    const result = await syncHubstaff();
    console.log("Mock sync:", result);
  }

  console.log(`Seeded ${tasks.length} tasks (${mock ? "mock" : "live"} mode).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
