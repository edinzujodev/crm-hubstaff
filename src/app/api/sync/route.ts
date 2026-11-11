import { connection } from "next/server";
import { getAuth } from "@/lib/auth";
import { lastSyncAt, syncHubstaff } from "@/lib/sync";

// For a scheduler (cron, Task Scheduler, Vercel Cron): pulls Hubstaff activities
// even when nobody has the app open. Send "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await syncHubstaff());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// One sync at a time per server, so a second tab or a double click doesn't start another Hubstaff read.
let running: ReturnType<typeof syncHubstaff> | null = null;

/**
 * Called by the open app (every few minutes, and from "Sync Hubstaff"). It is a plain request on purpose:
 * a Server Action would queue in front of page navigations while Hubstaff answers, and refresh the page.
 * Skips when a sync ran in the last 2 minutes unless `?force=1`.
 */
export async function POST(request: Request) {
  await connection();
  if (!(await getAuth())) return Response.json({ error: "Sign in first." }, { status: 401 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    if (!force && !running) {
      const last = await lastSyncAt();
      if (last && Date.now() - last.getTime() < 2 * 60 * 1000) return Response.json({ ran: false });
    }
    running ??= syncHubstaff().finally(() => {
      running = null;
    });
    const result = await running;
    return Response.json({ ran: true, fetched: result.fetched });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
