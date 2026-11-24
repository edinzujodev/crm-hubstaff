"use client";

import { Skeleton } from "primereact/skeleton";

/** Grey rows that stand in for a table while it loads. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton shape="circle" size="1.75rem" />
          <Skeleton width="28%" height="1rem" />
          <Skeleton width="14%" height="1rem" />
          <Skeleton width="14%" height="1rem" />
          <Skeleton className="ml-auto" width="10%" height="1rem" />
        </div>
      ))}
    </div>
  );
}

/**
 * Grey stand-ins for the page buttons above a TabCard. They use the real button classes around the real labels
 * (kept invisible), so the row is exactly as tall and as wide as the buttons that replace it.
 */
export function ActionsSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" aria-hidden>
      {labels.map((label) => (
        <span key={label} className="p-button p-component relative gap-2 !border-transparent !bg-transparent">
          <i className="pi pi-plus invisible text-sm" />
          <span className="invisible">{label}</span>
          <Skeleton className="!absolute inset-0" width="100%" height="100%" />
        </span>
      ))}
    </div>
  );
}

/**
 * A list page while it loads: the tab row and a table inside the white box. Pass `actions` (the labels of the
 * buttons the page shows above the box) so the box doesn't jump down when they appear.
 */
export function ListSkeleton({ rows = 6, actions }: { rows?: number; actions?: string[] }) {
  const box = (
    <div className="card overflow-hidden" role="status" aria-label="Loading">
      <div className="mx-4 flex gap-6 border-b border-border pb-3 pt-4">
        {[7, 8, 7, 8].map((w, i) => (
          <Skeleton key={i} width={`${w}rem`} height="1.5rem" />
        ))}
      </div>
      <div className="flex items-center justify-between px-4 pt-4">
        <Skeleton width="16rem" height="2.2rem" />
        <Skeleton width="8rem" height="2.2rem" />
      </div>
      <TableSkeleton rows={rows} />
    </div>
  );
  if (!actions?.length) return box;
  return (
    <div className="space-y-3">
      <ActionsSkeleton labels={actions} />
      {box}
    </div>
  );
}

/** A detail page while it loads: header card, facts strip and a tabbed box. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Skeleton width="5.5rem" height="2.2rem" />
      <div className="card flex items-center justify-between gap-4 p-4">
        <div className="space-y-2">
          <Skeleton width="14rem" height="1.5rem" />
          <Skeleton width="9rem" height="1rem" />
        </div>
        <Skeleton width="8rem" height="2rem" />
      </div>
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton shape="circle" size="2.25rem" />
            <div className="space-y-1.5">
              <Skeleton width="4rem" height="0.7rem" />
              <Skeleton width="7rem" height="0.9rem" />
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="mx-4 flex gap-6 border-b border-border pb-3 pt-4">
          {[7, 6, 6].map((w, i) => (
            <Skeleton key={i} width={`${w}rem`} height="1.5rem" />
          ))}
        </div>
        <TableSkeleton rows={4} />
      </div>
    </div>
  );
}

/** The dashboard while it loads: a grid of widget cards. */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="grid gap-4 md:grid-cols-2">
      <h1 className="sr-only">Dashboard</h1>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton width="10rem" height="1.25rem" />
          <Skeleton height="6rem" />
          <Skeleton width="60%" height="1rem" />
        </div>
      ))}
    </div>
  );
}

/** The side menu while the person's role loads. */
export function NavSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} height="2.4rem" className="!bg-foreground/10" />
      ))}
    </div>
  );
}

/** The profile button at the bottom of the side menu. */
export function ProfileSkeleton() {
  return <Skeleton width="100%" height="2.75rem" borderRadius="9999px" className="!bg-foreground/10" />;
}

/** A sign-in box while it loads. */
export function FormSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton height="2.5rem" />
      <Skeleton height="2.5rem" />
    </div>
  );
}
