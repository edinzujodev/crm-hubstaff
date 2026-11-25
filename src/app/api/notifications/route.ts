import { connection } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { latestNotifications, markRead, unreadCount } from "@/lib/notifications";

// Used by the bell in the top bar. Plain requests rather than server actions, so the check every minute never queues
// in front of a page navigation or redraws the page.

/** The unread count, and with `?list=1` the latest unread notifications too (what the bell shows). */
export async function GET(request: Request) {
  await connection();
  const auth = await getAuth();
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const list = new URL(request.url).searchParams.get("list") === "1";
  const [unread, items] = await Promise.all([unreadCount(auth.user.id), list ? latestNotifications(auth.user.id, { limit: 10, unreadOnly: true }) : undefined]);
  return Response.json({ unread, items });
}

const body = z.object({ ids: z.array(z.number().int().positive()).max(200).optional() });

/** Marks the given notifications (or all of them) as read. Only ever the signed-in person's own. */
export async function POST(request: Request) {
  await connection();
  const auth = await getAuth();
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  await markRead(auth.user.id, parsed.data.ids);
  return Response.json({ unread: await unreadCount(auth.user.id) });
}
