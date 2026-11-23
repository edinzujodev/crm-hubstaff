import type { ReactNode } from "react";

/** The app's mark: a white tile with a check, next to the name. */
export function AuthLogo({ className = "", withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#18181b] shadow-sm">
        <i className="pi pi-check-square text-lg" aria-hidden />
      </span>
      {withName && <span className="text-lg font-semibold tracking-tight">Client tracker</span>}
    </span>
  );
}

/**
 * The full-window frame of the sign-in and first-sign-in screens: a dark panel on the left (`side`) and the
 * content on the right. It covers the app's sidebar, which stays underneath. Without `side` the content gets the
 * whole card.
 */
export function AuthShell({ side, children, wide }: { side?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
        <div
          className={`grid w-full overflow-hidden rounded-3xl bg-surface shadow-xl ring-1 ring-border md:min-h-[600px] ${
            side ? (wide ? "max-w-6xl md:grid-cols-[300px_1fr]" : "max-w-5xl md:grid-cols-2") : "max-w-4xl"
          }`}
        >
          {side && (
            <aside className="relative flex flex-col gap-8 overflow-hidden bg-linear-to-br from-[#3f3f46] to-[#18181b] p-8 text-white sm:p-10">
              <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
              <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/5" />
              <div className="relative flex flex-1 flex-col gap-8">{side}</div>
            </aside>
          )}
          <section className="flex min-w-0 flex-col">{children}</section>
        </div>
      </div>
    </div>
  );
}
