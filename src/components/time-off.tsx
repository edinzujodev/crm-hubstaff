"use client";

import { useActionState, useCallback, useEffect, useMemo, useOptimistic, useState, useTransition } from "react";
import { Button, Checkbox, InputTextarea, Select } from "@/components/ui";
import { DateInput, type DayMark } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-modal";
import { TeamOffCalendar } from "@/components/team-off-calendar";
import { cancelTimeOff, decideTimeOff, requestTimeOff, updateTimeOff } from "@/app/hr/actions";
import { eachDay, fmtDays, fmtRange, fmtShortDay, isWeekend } from "@/lib/days";
import {
  blockable,
  blockedClash,
  type BlockedSpan,
  countDays,
  KIND_LABEL,
  KIND_TONE,
  needsApproval,
  statusLabel,
  type TeamOff,
  teamOffByDay,
  TIME_OFF_KINDS,
  type TimeOffKind,
  type TimeOffStatus,
} from "@/lib/leave-days";
import { notify } from "@/lib/toast";

export function KindBadge({ kind }: { kind: TimeOffKind }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${KIND_TONE[kind]}`}>{KIND_LABEL[kind]}</span>;
}

const STATUS_TONE: Record<TimeOffStatus, string> = {
  pending: "text-amber-700 dark:text-amber-400",
  approved: "text-emerald-700 dark:text-emerald-400",
  rejected: "text-red-600 dark:text-red-400",
  cancelled: "text-muted",
};
const STATUS_ICON: Record<TimeOffStatus, string> = {
  pending: "pi-clock",
  approved: "pi-check-circle",
  rejected: "pi-times-circle",
  cancelled: "pi-ban",
};

export function StatusBadge({ status, kind }: { status: TimeOffStatus; kind?: TimeOffKind }) {
  const recorded = kind === "sick" && status === "approved";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${recorded ? "text-foreground/70" : STATUS_TONE[status]}`}>
      <i className={`pi ${recorded ? "pi-file-edit" : STATUS_ICON[status]} text-xs`} aria-hidden />
      {kind ? statusLabel(kind, status) : statusLabel("vacation", status)}
    </span>
  );
}

export type PersonOption = { id: number; name: string };

/** Time off being changed by someone who approves for the person. */
export type TimeOffEdit = {
  id: number;
  userId: number;
  name: string;
  kind: TimeOffKind;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  note: string | null;
};

type FormProps = {
  me: PersonOption;
  /** Other people this person may enter time off for (their team, or everyone for a super admin). */
  people: PersonOption[];
  /** Public holidays that are days off, so the form can count working days. */
  daysOff: string[];
  /** Vacation days still free (left minus waiting requests) this year, to warn before sending. */
  vacationLeft: number;
  kind?: TimeOffKind;
  /** Whether the signed-in person's own entries are approved straight away (super admin). */
  selfApproves: boolean;
  /** Days nobody can take off. A super admin (selfApproves) can still enter time off on them. */
  blocked?: BlockedSpan[];
  /** Change this time off instead of adding new time off. */
  editing?: TimeOffEdit;
  /** A worker's team: shown as a calendar, and days it is full on can't be picked. */
  team?: TeamOff;
  /** Today in the company's time zone (for the team calendar). */
  today?: string;
  onDone: () => void;
};

/** What the form needs to know besides what is being added or changed. */
export type TimeOffFormContext = Omit<FormProps, "onDone" | "kind" | "editing">;

const NO_BLOCKS: BlockedSpan[] = [];

export function TimeOffForm({
  me,
  people,
  daysOff,
  vacationLeft,
  kind: initialKind = "vacation",
  selfApproves,
  blocked = NO_BLOCKS,
  editing,
  team,
  today = "",
  onDone,
}: FormProps) {
  const save = useMemo(() => (editing ? updateTimeOff.bind(null, editing.id) : requestTimeOff), [editing]);
  const [state, action, pending] = useActionState(save, null);
  // The server's answer stops showing once something is changed, until the form is sent again.
  const [stale, setStale] = useState<typeof state>(null);
  const error = state && !state.ok && state !== stale ? state : null;
  const touched = () => setStale(state);
  const [userId, setUserId] = useState(String(editing?.userId ?? me.id));
  const [kind, setKind] = useState<TimeOffKind>(editing?.kind ?? initialKind);
  const [startDate, setStart] = useState(editing?.startDate ?? "");
  const [endDate, setEnd] = useState(editing?.endDate ?? "");
  const [halfDay, setHalfDay] = useState(editing?.halfDay ?? false);
  const offSet = useMemo(() => new Set(daysOff), [daysOff]);
  const single = !!startDate && (!endDate || endDate === startDate);
  const forMe = userId === String(me.id);

  useEffect(() => {
    if (!state?.ok) return;
    if (editing) notify({ message: "Time off changed", detail: editing.userId === me.id ? undefined : `${editing.name} gets a notification.` });
    else
      notify({
        message: state.data.status === "pending" ? "Request sent" : "Added to the calendar",
        detail: state.data.status === "pending" ? "You'll see it here once it's approved." : undefined,
      });
    onDone();
  }, [state, onDone, editing, me.id]);

  const end = endDate || startDate;
  const days = startDate && end >= startDate ? countDays({ startDate, endDate: end, halfDay: halfDay && single }, offSet) : null;
  // Changing time off: the days it already takes are in vacationLeft, so the warning would be wrong.
  const overLimit = !editing && forMe && kind === "vacation" && days !== null && days > vacationLeft;
  const instant = !needsApproval(kind) || !forMe || selfApproves;
  const blocks = blockable(kind) ? blocked : [];
  const clash = startDate && end >= startDate ? blockedClash({ startDate, endDate: end }, blocks) : undefined;
  // The team's limit (workers only: leaders and super admins are warned by the server and may go past it).
  const offByDay = useMemo(() => (team ? teamOffByDay(team, offSet) : new Map<string, string[]>()), [team, offSet]);
  const limited = !!team && team.max !== null && blockable(kind);
  const fullDays = limited ? [...offByDay].filter(([, names]) => names.length >= team!.max!).map(([d]) => d) : [];
  const teamClash =
    limited && startDate && end >= startDate
      ? eachDay(startDate, end)
          .filter((d) => !isWeekend(d) && !offSet.has(d))
          .map((d) => ({ day: d, names: offByDay.get(d) ?? [] }))
          .find((x) => x.names.length >= team!.max!)
      : undefined;
  const refused = (!!clash && !selfApproves) || !!teamClash;
  const blockedDays = [...(selfApproves ? [] : blocks.flatMap((b) => eachDay(b.startDate, b.endDate))), ...fullDays];
  // A first day after the last day moves the last day along with it.
  const changeStart = (d: string) => {
    touched();
    setStart(d);
    if (endDate && d && endDate < d) setEnd(d);
  };
  const changeEnd = (d: string) => {
    touched();
    setEnd(d);
  };
  const pick = (d: string) => {
    if (!startDate || endDate || d < startDate) {
      changeStart(d);
      setEnd("");
    } else changeEnd(d);
  };
  // Shown in the picker: blocked days with the reason, and public holidays (they don't count as days off).
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const d of daysOff) out[d] = { tone: "holiday", title: "Public holiday" };
    for (const b of blocked) for (const d of eachDay(b.startDate, b.endDate)) out[d] = { tone: "blocked", title: `Blocked: ${b.reason}` };
    return out;
  }, [daysOff, blocked]);

  return (
    <form action={action} className="space-y-4">
      {editing ? (
        <p className="text-sm">
          <span className="text-xs font-medium text-muted">For</span> <span className="font-medium">{editing.name}</span>
        </p>
      ) : people.length > 0 && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          For
          <Select name="userId" value={userId} onChange={(e) => {
            touched();
            setUserId(e.target.value);
          }} className="w-full">
            <option value={String(me.id)}>Me ({me.name})</option>
            {people.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Kind
        <Select name="kind" value={kind} onChange={(e) => {
          touched();
          setKind(e.target.value as TimeOffKind);
        }} className="w-full">
          {TIME_OFF_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
        <span className="font-normal">
          {kind === "vacation"
            ? "Comes off the yearly vacation days."
            : kind === "sick"
              ? "Counts straight away, no approval needed."
              : kind === "religious"
                ? "A religious holiday you celebrate. Doesn't use vacation days."
                : "Doesn't use vacation days."}
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          First day
          <DateInput name="startDate" value={startDate} onChange={(e) => changeStart(e.target.value)} required disabledDays={blockedDays} marks={marks} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Last day
          <DateInput name="endDate" value={end} onChange={(e) => changeEnd(e.target.value)} disabledDays={blockedDays} marks={marks} className="w-full" />
        </label>
      </div>
      {team && (
        <TeamOffCalendar team={team} offByDay={offByDay} daysOff={offSet} today={today} start={startDate} end={endDate} onPick={pick} />
      )}
      {teamClash && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          <i className="pi pi-users mr-1.5 text-xs" aria-hidden />
          {team!.name} allows {team!.max} of {team!.size} people off at the same time, and {fmtShortDay(teamClash.day)} already has{" "}
          {teamClash.names.length} ({teamClash.names.join(", ")}) off or waiting for approval. Pick other days.
        </p>
      )}
      {/* Always there (only usable for a single day), so the form doesn't change height when dates are picked. */}
      <label className={`flex items-center gap-2 text-sm ${single ? "" : "text-muted"}`}>
        <Checkbox name="halfDay" checked={halfDay && single} disabled={!single} onChange={(e) => {
          touched();
          setHalfDay(e.target.checked);
        }} />
        Half a day
        {!single && <span className="text-xs">(single day only)</span>}
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Note <span className="sr-only">(optional)</span>
        <InputTextarea name="note" rows={2} maxLength={500} defaultValue={editing?.note ?? ""} autoResize className="w-full text-foreground" placeholder="Optional" />
      </label>

      {clash && (
        <p className={`rounded-lg px-3 py-2 text-sm ${refused ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
          <i className="pi pi-ban mr-1.5 text-xs" aria-hidden />
          {fmtRange(clash.startDate, clash.endDate)} is blocked: {clash.reason}.
          {refused ? " Nobody can take time off then." : " You can still enter it as a super admin."}
        </p>
      )}
      <p className={`rounded-lg px-3 py-2 text-sm ${overLimit ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-foreground/5"}`}>
          {days === null ? (
            <span className="text-muted">Pick the dates to see how many days it takes.</span>
          ) : days === 0 ? (
            "Only weekends or public holidays: nothing to take off."
          ) : (
            <>
              <strong>{fmtDays(days)}</strong> {kind === "vacation" && forMe && <>of your {fmtDays(vacationLeft)} left</>}
              {overLimit && " — that's more than you have left."}
            </>
          )}
      </p>
      {error && !error.canOverride && (
        <p role="alert" className="text-sm text-red-600">
          {error.error}
        </p>
      )}
      {error && error.canOverride && (
        <div role="alert" className="space-y-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <p className="flex gap-2">
            <i className="pi pi-exclamation-triangle mt-0.5 text-sm" aria-hidden />
            <span>{error.error}</span>
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" size="small" severity="secondary" outlined disabled={pending} label="Cancel" onClick={onDone} />
            <Button name="overrideLimit" value="on" size="small" severity="warning" disabled={pending} label="Save anyway" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted">
          {editing ? (editing.userId === me.id ? "" : `${editing.name} gets a notification.`) : instant ? "Counts straight away." : "Needs approval."}
        </span>
        <Button className="shrink-0 whitespace-nowrap" disabled={pending || !startDate || days === 0 || refused}>
          {pending ? "Saving…" : editing ? "Save changes" : instant ? "Save" : "Send request"}
        </Button>
      </div>
    </form>
  );
}

/** A button that opens the time-off form. */
export function TimeOffButton({
  label,
  icon,
  outlined,
  ...form
}: Omit<FormProps, "onDone"> & { label: string; icon?: string; outlined?: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button icon={icon ? `pi ${icon}` : undefined} severity={outlined ? "secondary" : undefined} outlined={outlined} onClick={() => setOpen(true)} label={label} />
      {open && (
        <Modal title={label} onClose={close}>
          <TimeOffForm {...form} onDone={close} />
        </Modal>
      )}
    </>
  );
}

/**
 * Cancelling time off, optimistically: `cancelled` turns true on the click and stays so until the server's answer
 * (with the refreshed page) arrives. If the server refuses, it goes back to false by itself and a notice says why.
 * The "Are you sure?" modal comes back too, for the caller to render.
 */
function useCancelTimeOff(id: number) {
  const [cancelled, setCancelled] = useOptimistic(false);
  const [, startTransition] = useTransition();
  const [ask, confirmModal] = useConfirm();
  const cancel = async () => {
    const sure = await ask({
      title: "Cancel this time off?",
      message: "It comes off the calendar, and any days it took are given back.",
      confirmLabel: "Cancel time off",
      cancelLabel: "Keep it",
    });
    if (!sure) return;
    startTransition(async () => {
      setCancelled(true);
      const r = await cancelTimeOff(id);
      notify(r.ok ? { message: "Time off cancelled" } : { message: "Couldn't cancel it", detail: r.error, tone: "error" });
    });
  };
  return [cancelled, cancel, confirmModal] as const;
}

/** `data-pending` lets the row or card around it fade (has-data-pending:) until the server confirms. */
export function CancelTimeOffButton({ id, label = "Cancel" }: { id: number; label?: string }) {
  const [cancelled, cancel, confirmModal] = useCancelTimeOff(id);
  if (cancelled) {
    return (
      <span data-pending="" className="text-xs font-medium text-muted">
        Cancelled
      </span>
    );
  }
  return (
    <>
      <Button size="small" text severity="danger" label={label} onClick={() => void cancel()} />
      {confirmModal}
    </>
  );
}

const PILL: Record<TimeOffStatus, [string, string]> = {
  pending: ["Pending", "bg-amber-400 text-amber-950"],
  approved: ["Approved", "bg-emerald-500 text-white"],
  rejected: ["Rejected", "bg-red-500 text-white"],
  cancelled: ["Cancelled", "bg-foreground/10 text-muted"],
};
/** Sick leave is recorded, not approved. */
const RECORDED: [string, string] = ["Recorded", "bg-zinc-600 text-white dark:bg-zinc-400 dark:text-zinc-950"];

/** A request's status pill, with Cancel under it when allowed; the pill shows "Cancelled" as soon as it's clicked. */
export function RequestStatus({
  id,
  kind,
  status,
  cancellable,
}: {
  id: number;
  kind: TimeOffKind;
  status: TimeOffStatus;
  cancellable: boolean;
}) {
  const [cancelled, cancel, confirmModal] = useCancelTimeOff(id);
  const shown = cancelled ? "cancelled" : status;
  const [pill, tone] = kind === "sick" && shown === "approved" ? RECORDED : PILL[shown];
  return (
    <>
      <span data-pending={cancelled ? "" : undefined} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${tone}`}>
        {pill}
      </span>
      {cancellable && !cancelled && <Button size="small" text severity="danger" label="Cancel" onClick={() => void cancel()} />}
      {confirmModal}
    </>
  );
}

/**
 * Approve straight away, or reject with a reason. The decision shows on the click (and the row fades through
 * `data-pending`) while the server saves it; if that fails, the buttons come back and a notice says why.
 */
export function DecideButtons({ id, name }: { id: number; name: string }) {
  const [decided, setDecided] = useOptimistic<"approved" | "rejected" | null>(null);
  const [, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [ask, confirmModal] = useConfirm();
  const decide = (approve: boolean, overrideLimit = false) => {
    setRejecting(false);
    startTransition(async () => {
      setDecided(approve ? "approved" : "rejected");
      const r = await decideTimeOff(id, approve, approve ? undefined : reason, overrideLimit);
      // Over the team's limit: a super admin may approve it anyway (asked once the buttons are back).
      if (!r.ok && r.canOverride) {
        void approveAnyway(r.error);
        return;
      }
      notify(
        r.ok
          ? { message: approve ? `Approved for ${name}` : `Rejected for ${name}` }
          : { message: "Couldn't save the decision", detail: r.error, tone: "error" },
      );
      // The reason is still there, so a failed rejection can be sent again.
      if (!r.ok && !approve) setRejecting(true);
    });
  };
  const approveAnyway = async (why: string) => {
    if (await ask({ title: "Over the team's limit", message: why, confirmLabel: "Approve anyway", tone: "primary" })) decide(true, true);
  };
  if (decided) {
    return (
      <span
        data-pending=""
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${decided === "approved" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
      >
        <i className={`pi ${decided === "approved" ? "pi-check-circle" : "pi-times-circle"} text-xs`} aria-hidden />
        {decided === "approved" ? "Approved" : "Rejected"}
        {confirmModal}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <Button size="small" icon="pi pi-check" label="Approve" onClick={() => decide(true)} />
      <Button size="small" severity="secondary" outlined label="Reject" onClick={() => setRejecting(true)} />
      {rejecting && (
        <Modal title={`Reject ${name}'s request`} onClose={() => setRejecting(false)}>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Why? They see this.
            <InputTextarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className="w-full text-foreground" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" severity="secondary" outlined label="Back" onClick={() => setRejecting(false)} />
            <Button severity="danger" label="Reject" disabled={!reason.trim()} onClick={() => decide(false)} />
          </div>
        </Modal>
      )}
      {confirmModal}
    </span>
  );
}
