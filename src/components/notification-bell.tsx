"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui";
import type { NotificationItem } from "@/lib/notifications";

const CHECK_EVERY_MS = 60 * 1000;

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));
}

/** Marks notifications read on the server (all of them without ids). Returns the new unread count, if it answered. */
async function markRead(ids?: number[]): Promise<number | null> {
  try {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ids ? { ids } : {}),
    });
    return res.ok ? ((await res.json()) as { unread: number }).unread : null;
  } catch {
    return null;
  }
}

/** One notification as a clickable row. */
function NotificationRow({ n, now, onOpen }: { n: NotificationItem; now: number; onOpen: (n: NotificationItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5 ${n.read ? "" : "bg-primary/5"}`}
    >
      {n.actor ? <Avatar name={n.actor} size="sm" /> : <span className="h-7 w-7 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${n.read ? "text-foreground/80" : "font-medium"}`}>{n.title}</span>
        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
        <span className="block text-[11px] text-muted">{ago(n.createdAt, now)}</span>
      </span>
      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />}
    </button>
  );
}

/**
 * The bell in the top bar. The count comes with the page and is checked again every minute while the tab is visible
 * (a small request, not a page refresh). Opening it lists what is still unread; clicking one marks it read and opens
 * where it points. Everything, read or not, is on the Notifications page.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  // A new page render brings a fresh count.
  const [seen, setSeen] = useState(initialUnread);
  if (seen !== initialUnread) {
    setSeen(initialUnread);
    setUnread(initialUnread);
  }
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [now, setNow] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  async function load(list: boolean) {
    try {
      const res = await fetch(`/api/notifications${list ? "?list=1" : ""}`);
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; items?: NotificationItem[] };
      setUnread(data.unread);
      if (data.items) {
        setItems(data.items);
        setNow(Date.now());
      }
    } catch {
      // Offline for a moment: keep what is shown.
    }
  }

  useEffect(() => {
    const every = setInterval(() => {
      if (!document.hidden) void load(false);
    }, CHECK_EVERY_MS);
    const onVisible = () => {
      if (!document.hidden) void load(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      setItems(null);
      void load(true);
    }
    setOpen(!open);
  };

  const openItem = (n: NotificationItem) => {
    setUnread((u) => Math.max(0, u - 1));
    void markRead([n.id]);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const readAll = () => {
    setItems([]);
    setUnread(0);
    void markRead();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors hover:bg-primary/10 hover:text-foreground"
      >
        <i className="pi pi-bell text-sm" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="card absolute right-0 top-full z-40 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-semibold">
              Notifications{unread > 0 && <span className="font-normal text-muted"> · {unread} unread</span>}
            </p>
            {unread > 0 && (
              <button type="button" onClick={readAll} className="cursor-pointer text-xs text-muted underline hover:text-foreground">
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-[26rem] overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">
                <i className="pi pi-check-circle mb-2 block text-lg" aria-hidden />
                You&apos;re all caught up.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationRow n={n} now={now} onOpen={openItem} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-4 py-2.5 text-center text-xs font-medium text-muted hover:bg-foreground/5 hover:text-foreground"
          >
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

/** "Today", "Yesterday", or the date, for grouping the page's list by day in the company's time zone. */
function dayLabel(iso: string, now: number, timeZone: string) {
  const key = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(t);
  const d = new Date(iso).getTime();
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(now - 86400000)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(d);
}

/**
 * The Notifications page's list: grouped by day, newest first. Clicking one marks it read and opens it; "Mark all as
 * read" clears the lot and refreshes the page so the bell's count follows.
 */
export function NotificationFeed({
  items: initial,
  unread,
  empty,
  now,
  timeZone,
}: {
  items: NotificationItem[];
  unread: number;
  empty: string;
  /** When the page was rendered, so "5 min ago" reads the same on the server and in the browser. */
  now: number;
  timeZone: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }
  const left = items.filter((n) => !n.read).length;

  const openItem = (n: NotificationItem) => {
    if (!n.read) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markRead([n.id]);
    }
    if (n.href) router.push(n.href);
  };

  const readAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    await markRead();
    router.refresh();
  };

  if (!items.length) return <p className="px-4 py-12 text-center text-sm text-muted">{empty}</p>;

  const groups: { label: string; items: NotificationItem[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.createdAt, now, timeZone);
    if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div>
      {(unread > 0 || left > 0) && (
        <div className="flex justify-end border-b border-border px-4 py-2">
          <Button size="small" text label="Mark all as read" icon="pi pi-check" disabled={left === 0} onClick={() => void readAll()} />
        </div>
      )}
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="border-b border-border bg-foreground/[0.03] px-4 py-1.5 text-xs font-semibold text-muted">{g.label}</h2>
          <ul className="divide-y divide-border border-b border-border last:border-b-0">
            {g.items.map((n) => (
              <li key={n.id}>
                <NotificationRow n={n} now={now} onOpen={openItem} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
