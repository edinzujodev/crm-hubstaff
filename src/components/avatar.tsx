"use client";

import { useState, useSyncExternalStore } from "react";

// Who has a profile photo ({ userId: version }), loaded once per page load from /api/avatars and shared by every
// avatar on the page. Until it arrives (and for anyone without a photo) the initials show.
type Photos = Record<string, number>;
let photos: Photos | null = null;
let loadedAt = 0;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loading) return;
  loading = true;
  fetch("/api/avatars", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Photos>) : null))
    .then((data) => {
      if (data) {
        photos = data;
        loadedAt = Date.now();
        emit();
      }
    })
    .catch(() => {})
    .finally(() => {
      loading = false;
    });
}

const STALE_MS = 5 * 60 * 1000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!photos) load();
  // Coming back to the tab after a while picks up photos colleagues changed meanwhile.
  const onVisible = () => {
    if (document.visibilityState === "visible" && Date.now() - loadedAt > STALE_MS) load();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    listeners.delete(listener);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** After the signed-in person changes their photo: every avatar of theirs on the page updates at once. */
export function setPhotoVersion(userId: number, version: number | null) {
  const next = { ...(photos ?? {}) };
  if (version === null) delete next[userId];
  else next[userId] = version;
  photos = next;
  emit();
}

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const SIZES = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-sm",
  xl: "h-12 w-12 text-base md:h-14 md:w-14 md:text-lg",
  // The profile's own big photo: fills its column on wider screens.
  hero: "h-24 w-24 text-3xl md:h-auto md:w-full md:aspect-square md:text-6xl",
};

/**
 * A person's profile photo, or a round badge with their initials when they have none. `userId` finds the photo;
 * without it the initials always show. `solid`: the strong primary badge (the signed-in person's own, in the menus).
 */
export function Avatar({
  name,
  userId,
  size = "md",
  solid = false,
}: {
  name: string;
  userId?: number | null;
  size?: keyof typeof SIZES;
  solid?: boolean;
}) {
  const all = useSyncExternalStore(subscribe, () => photos, () => null);
  const version = userId ? all?.[userId] : undefined;
  const src = version ? `/api/avatar/${userId}?v=${version}` : null;
  // A photo that fails to load (removed meanwhile) falls back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      aria-hidden
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${SIZES[size]} ${
        solid ? "bg-primary text-(--primary-fg)" : "bg-primary/15 text-primary"
      }`}
    >
      {initialsOf(name)}
      {src && failed !== src && (
        // eslint-disable-next-line @next/next/no-img-element -- a small private photo from our own API, already sized
        <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(src)} />
      )}
    </span>
  );
}
