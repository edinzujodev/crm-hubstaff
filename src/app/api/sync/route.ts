import { connection } from "next/server";
import { syncHubstaff } from "@/lib/sync";

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
