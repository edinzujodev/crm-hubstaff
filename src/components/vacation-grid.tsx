import { Avatar } from "@/components/avatar";
import { eachDay, fmtShortDay, isWeekend } from "@/lib/days";
import { KIND_LABEL, statusLabel, type TimeOffKind, type TimeOffStatus } from "@/lib/leave-days";

/**
 * Solid for approved, a light box with a coloured border for pending. "out" is what colleagues see: it uses the
 * vacation colours, so approved time off is one colour whatever the viewer may know about it.
 */
const SOLID: Record<TimeOffKind | "out", string> = {
  vacation: "bg-sky-500",
  sick: "bg-rose-500",
  personal: "bg-violet-500",
  unpaid: "bg-zinc-400 dark:bg-zinc-500",
  religious: "bg-amber-500",
  out: "bg-sky-500",
};
const PENDING: Record<TimeOffKind | "out", string> = {
  vacation: "border-2 border-sky-400 bg-sky-500/10",
  sick: "border-2 border-rose-400 bg-rose-500/10",
  personal: "border-2 border-violet-400 bg-violet-500/10",
  unpaid: "border-2 border-zinc-400 bg-zinc-500/10",
  religious: "border-2 border-amber-400 bg-amber-500/10",
  out: "border-2 border-sky-400 bg-sky-500/10",
};

export type GridEntry = {
  startDate: string;
  endDate: string;
  halfDay: boolean;
  status: TimeOffStatus;
  /** "out" when the viewer may only know the person is away, not why. */
  kind: TimeOffKind | "out";
  note?: string | null;
};

export type GridRow = { id: number; name: string; sub?: string; entries: GridEntry[] };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Who is away when: one row per person, one column per day of the month. Only working days are marked, since
 * weekends and public holidays don't count as time off.
 */
export function VacationGrid({
  first,
  last,
  today,
  rows,
  holidays,
  kinds,
}: {
  first: string;
  last: string;
  today: string;
  rows: GridRow[];
  /** Public holidays that are days off, by date. */
  holidays: Map<string, string>;
  /** The kinds to explain in the legend. */
  kinds: (TimeOffKind | "out")[];
}) {
  // Working days only: weekends are never time off, so they would only be empty columns.
  const days = eachDay(first, last).filter((d) => !isWeekend(d));
  const off = (d: string) => holidays.has(d);
  // A line before each Monday (except the first column) keeps the weeks apart.
  const weekStart = (d: string, i: number) => i > 0 && new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
  const cols = { gridTemplateColumns: `repeat(${days.length}, minmax(1.75rem, 1fr))` };

  return (
    <div>
      <div className="flex">
        {/* Names */}
        <div className="w-32 shrink-0 border-r border-border sm:w-48">
          <div className="flex h-12 items-end border-b border-border px-4 pb-2 text-xs font-medium text-muted">People</div>
          {rows.map((r) => (
            <div key={r.id} className="flex h-11 items-center gap-2.5 border-b border-border px-3 last:border-b-0 sm:px-4">
              <Avatar name={r.name} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.name}</span>
                {r.sub && <span className="block truncate text-[11px] text-muted">{r.sub}</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-max">
            <div className="grid h-12 border-b border-border" style={cols}>
              {days.map((d, i) => (
                <div
                  key={d}
                  title={holidays.get(d) ?? fmtShortDay(d)}
                  className={`flex flex-col items-center justify-end pb-1.5 text-[11px] leading-tight ${off(d) ? "bg-foreground/[0.035] text-muted" : ""} ${weekStart(d, i) ? "border-l border-border" : ""}`}
                >
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 font-semibold tabular-nums ${
                      d === today ? "bg-primary text-(--primary-fg)" : ""
                    }`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="text-[10px] text-muted">{holidays.has(d) ? "★" : WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                </div>
              ))}
            </div>
            {rows.map((r) => (
              <div key={r.id} className="grid h-11 border-b border-border last:border-b-0" style={cols}>
                {days.map((d, i) => {
                  const e = off(d) ? undefined : r.entries.find((x) => x.startDate <= d && x.endDate >= d);
                  return (
                    <div key={d} className={`flex items-center justify-center p-[3px] ${off(d) ? "bg-foreground/[0.035]" : ""} ${weekStart(d, i) ? "border-l border-border" : ""}`}>
                      {e ? (
                        <span
                          title={`${r.name} · ${e.kind === "out" ? "Out" : KIND_LABEL[e.kind]}${e.halfDay ? " (half day)" : ""} · ${fmtShortDay(d)} · ${statusLabel(e.kind, e.status)}${e.note ? ` · ${e.note}` : ""}`}
                          className={`block w-full rounded-md ${e.halfDay ? "h-1/2" : "h-full"} ${e.status === "pending" ? PENDING[e.kind] : SOLID[e.kind]}`}
                        />
                      ) : (
                        <span className={`block h-full w-full rounded-md ${off(d) ? "" : "bg-foreground/[0.04]"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border px-4 py-3 text-xs">
        {/* "out" shares the vacation colours, so it has no entry of its own: vacation then reads "Time off". */}
        {kinds.filter((k) => k !== "out").map((k) => (
          <div key={k} className="space-y-1">
            <p className="font-medium text-muted">{k === "vacation" && kinds.includes("out") ? "Time off" : KIND_LABEL[k]}</p>
            <p className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${SOLID[k]}`} aria-hidden /> {statusLabel(k, "approved")}
              </span>
              {/* Sick leave is recorded straight away: it is never pending. */}
              {k !== "sick" && (
                <span className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${PENDING[k]} border`} aria-hidden /> Pending
                </span>
              )}
            </p>
          </div>
        ))}
        <p className="ml-auto self-end text-muted">Working days only. Shaded: public holidays (★), never counted.</p>
      </div>
    </div>
  );
}
