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
  /** Who approved, rejected or withdrew it (null: nobody else, e.g. sick leave or the person's own entry). */
  decidedBy: string | null;
  cancellable: boolean;
};

function Cell({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {/* On wider screens the labels are in the header row instead. */}
      <p className="text-xs text-muted sm:sr-only">{label}</p>
      <p className="truncate text-sm font-medium">{children}</p>
    </div>
  );
}

/** The same columns for the header and every row. */
const COLS = "grid grid-cols-2 gap-x-4 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_15rem]";

/** Your time off, newest first, one row per request (inside a card), under one header row. */
export function LeaveRequests({ items }: { items: LeaveRequest[] }) {
  if (!items.length) {
    return <p className="px-5 py-6 text-sm text-muted">You haven&apos;t asked for any time off yet.</p>;
  }
  return (
    <div>
    <div className={`${COLS} hidden border-b border-border bg-foreground/[0.03] px-5 py-2 text-xs font-medium text-muted sm:grid`} aria-hidden>
      <span>Request type</span>
      <span>Duration</span>
      <span>Start day</span>
      <span>End day</span>
      <span>Status</span>
    </div>
    <ul className="divide-y divide-border">
      {items.map((t) => {
        return (
          <li
            key={t.id}
            className={`${COLS} items-center gap-y-3 px-5 py-3.5 transition-opacity has-data-pending:opacity-60 ${
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
            {/* The status on the left, Withdraw on the right, on one line. */}
            <div className="col-span-2 flex min-h-8 items-center justify-between gap-3 sm:col-span-1">
              <RequestStatus id={t.id} kind={t.kind} status={t.status} cancellable={t.cancellable} />
            </div>
            {(t.decidedBy || (t.status === "rejected" && t.decisionNote)) && (
              <p className="col-span-full -mt-1 text-xs text-muted">
                {t.decidedBy && (
                  <>
                    {t.status === "rejected" ? "Rejected" : t.status === "cancelled" ? "Withdrawn" : "Approved"} by{" "}
                    <span className="font-medium text-foreground/80">{t.decidedBy}</span>
                  </>
                )}
                {t.decidedBy && t.status === "rejected" && t.decisionNote && " · "}
                {t.status === "rejected" && t.decisionNote && (
                  <>
                    <span className="font-medium text-foreground/80">Reason:</span> {t.decisionNote}
                  </>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ul>
    </div>
  );
}
