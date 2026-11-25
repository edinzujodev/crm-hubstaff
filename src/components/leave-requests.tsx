import { RequestStatus } from "@/components/time-off";
import { fmtDays, fmtLongDay } from "@/lib/days";
import { KIND_LABEL, type TimeOffKind, type TimeOffStatus } from "@/lib/leave-days";

/** Solid dots per kind, matching the badge colours. */
const KIND_DOT: Record<TimeOffKind, string> = {
  vacation: "bg-sky-500",
  sick: "bg-rose-500",
  personal: "bg-violet-500",
  unpaid: "bg-zinc-400",
  religious: "bg-amber-500",
};

export type LeaveRequest = {
  id: number;
  kind: TimeOffKind;
  status: TimeOffStatus;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  /** Leave days it takes (working days, half days as 0.5). */
  days: number;
  decisionNote: string | null;
  cancellable: boolean;
};

function Cell({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate text-sm font-medium">{children}</p>
    </div>
  );
}

/** Your time off, newest first, one row per request (inside a card). */
export function LeaveRequests({ items }: { items: LeaveRequest[] }) {
  if (!items.length) {
    return <p className="px-5 py-6 text-sm text-muted">You haven&apos;t asked for any time off yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((t) => {
        return (
          <li
            key={t.id}
            className={`grid grid-cols-2 items-center gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_8.5rem] transition-opacity has-data-pending:opacity-60 ${
              t.status === "cancelled" ? "opacity-60" : ""
            }`}
          >
            <Cell label="Request type">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[t.kind]}`} aria-hidden />
                {KIND_LABEL[t.kind]}
              </span>
            </Cell>
            <Cell label="Duration">{t.halfDay && t.days <= 0.5 ? "Half day" : fmtDays(t.days)}</Cell>
            <Cell label="Start day">{fmtLongDay(t.startDate)}</Cell>
            <Cell label="End day">{fmtLongDay(t.endDate)}</Cell>
            <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:gap-1">
              <RequestStatus id={t.id} kind={t.kind} status={t.status} cancellable={t.cancellable} />
            </div>
            {t.status === "rejected" && t.decisionNote && (
              <p className="col-span-full -mt-1 text-xs text-muted">
                <span className="font-medium text-foreground/80">Reason:</span> {t.decisionNote}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
