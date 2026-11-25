import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { NotificationFeed } from "@/components/notification-bell";
import { TableSkeleton } from "@/components/page-skeleton";
import { TabCard } from "@/components/tab-card";
import { pageGuard } from "@/lib/auth";
import { config } from "@/lib/config";
import { latestNotifications, totalCount, unreadCount } from "@/lib/notifications";

const PAGE = 50;

async function NotificationsContent({ searchParams }: { searchParams: PageProps<"/notifications">["searchParams"] }) {
  await connection();
  const auth = await pageGuard();
  const sp = await searchParams;
  const unreadOnly = sp.show === "unread";
  const shown = Math.min(1000, Math.max(PAGE, Number(sp.n) || PAGE));
  const [items, unread, total] = await Promise.all([
    // One more than shown, to know whether "Show more" is needed.
    latestNotifications(auth.user.id, { limit: shown + 1, unreadOnly }),
    unreadCount(auth.user.id),
    totalCount(auth.user.id),
  ]);
  const more = items.length > shown;
  const renderedAt = new Date().getTime();
  const base = unreadOnly ? "/notifications?show=unread" : "/notifications";

  return (
    <TabCard
      tabs={[
        { label: "All", href: "/notifications", count: total },
        { label: "Unread", href: "/notifications?show=unread", count: unread, alarm: unread > 0 },
      ]}
      active={unreadOnly ? 1 : 0}
    >
      <h1 className="sr-only">Notifications</h1>
      <NotificationFeed
        items={items.slice(0, shown)}
        unread={unread}
        now={renderedAt}
        timeZone={config.timeZone}
        empty={unreadOnly ? "You're all caught up." : "No notifications yet. Requests and decisions about time off show up here."}
      />
      {more && (
        <div className="border-t border-border p-3 text-center">
          <Link href={`${base}${unreadOnly ? "&" : "?"}n=${shown + PAGE}`} scroll={false} className="text-sm text-muted underline hover:text-foreground">
            Show more
          </Link>
        </div>
      )}
    </TabCard>
  );
}

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <NotificationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
