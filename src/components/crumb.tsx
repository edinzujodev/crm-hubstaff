"use client";

import { useEffect, useSyncExternalStore } from "react";

/** The name a detail page gives the last part of the breadcrumb ("Home › Recurring › Monthly report"). */
let current: { path: string; name: string } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Put on a detail page: names the breadcrumb for that page's own path. */
export function Crumb({ name }: { name: string }) {
  useEffect(() => {
    const path = window.location.pathname;
    current = { path, name };
    emit();
    return () => {
      if (current?.path === path) current = null;
      emit();
    };
  }, [name]);
  return null;
}

/** The name set by the page for this path, if any. */
export function useCrumb(pathname: string): string | null {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
  return snap && snap.path === pathname ? snap.name : null;
}
