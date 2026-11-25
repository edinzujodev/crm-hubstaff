"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
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

async function post(ids?: number[]) {
  await fetch("/api/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
  }).catch(() => {});
}

/**
 * The bell in the top bar. The count comes with the page and is checked again every minute while the tab is visible
 * (a small request, not a page refresh). Opening it loads the latest notifications; clicking one marks it read and
 * opens where it points.
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
    if (!open) void load(true);
    setOpen(!open);
  };

  const openItem = (n: NotificationItem) => {
    if (!n.read) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
      setUnread((u) => Math.max(0, u - 1));
      void post([n.id]);
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  const readAll = () => {
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
    setUnread(0);
    void post();
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
            <p className="font-semibold">Notifications</p>
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
              <p className="px-4 py-8 text-center text-sm text-muted">Nothing yet. Requests and decisions about time off show up here.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
