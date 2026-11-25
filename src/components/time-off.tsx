"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { Button, Checkbox, InputTextarea, Select } from "@/components/ui";
import { DateInput, type DayMark } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { cancelTimeOff, decideTimeOff, requestTimeOff } from "@/app/hr/actions";
import { eachDay, fmtDays, fmtRange } from "@/lib/days";
import {
  blockable,
  blockedClash,
  type BlockedSpan,
  countDays,
  KIND_LABEL,
  KIND_TONE,
  needsApproval,
  STATUS_LABEL,
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

export function StatusBadge({ status }: { status: TimeOffStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      <i className={`pi ${STATUS_ICON[status]} text-xs`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export type PersonOption = { id: number; name: string };

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
  onDone: () => void;
};

const NO_BLOCKS: BlockedSpan[] = [];

function TimeOffForm({ me, people, daysOff, vacationLeft, kind: initialKind = "vacation", selfApproves, blocked = NO_BLOCKS, onDone }: FormProps) {
  const [state, action, pending] = useActionState(requestTimeOff, null);
  const [userId, setUserId] = useState(String(me.id));
  const [kind, setKind] = useState<TimeOffKind>(initialKind);
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [halfDay, setHalfDay] = useState(false);
  const offSet = useMemo(() => new Set(daysOff), [daysOff]);
  const single = !!startDate && (!endDate || endDate === startDate);
  const forMe = userId === String(me.id);

  useEffect(() => {
    if (!state?.ok) return;
    notify({
      message: state.data.status === "pending" ? "Request sent" : "Added to the calendar",
      detail: state.data.status === "pending" ? "You'll see it here once it's approved." : undefined,
    });
    onDone();
  }, [state, onDone]);

  const end = endDate || startDate;
  const days = startDate && end >= startDate ? countDays({ startDate, endDate: end, halfDay: halfDay && single }, offSet) : null;
  const overLimit = forMe && kind === "vacation" && days !== null && days > vacationLeft;
  const instant = !needsApproval(kind) || !forMe || selfApproves;
  const blocks = blockable(kind) ? blocked : [];
  const clash = startDate && end >= startDate ? blockedClash({ startDate, endDate: end }, blocks) : undefined;
  const refused = !!clash && !selfApproves;
  const blockedDays = selfApproves ? [] : blocks.flatMap((b) => eachDay(b.startDate, b.endDate));
  // Shown in the picker: blocked days with the reason, and public holidays (they don't count as days off).
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const d of daysOff) out[d] = { tone: "holiday", title: "Public holiday" };
    for (const b of blocked) for (const d of eachDay(b.startDate, b.endDate)) out[d] = { tone: "blocked", title: `Blocked: ${b.reason}` };
    return out;
  }, [daysOff, blocked]);

  return (
    <form action={action} className="space-y-4">
      {people.length > 0 && (
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          For
          <Select name="userId" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full">
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
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as TimeOffKind)} className="w-full">
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
          <DateInput name="startDate" value={startDate} onChange={(e) => setStart(e.target.value)} required disabledDays={blockedDays} marks={marks} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Last day
          <DateInput name="endDate" value={end} onChange={(e) => setEnd(e.target.value)} disabledDays={blockedDays} marks={marks} className="w-full" />
        </label>
      </div>
      {single && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="halfDay" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
          Half a day
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Note <span className="sr-only">(optional)</span>
        <InputTextarea name="note" rows={2} maxLength={500} autoResize className="w-full text-foreground" placeholder="Optional" />
      </label>

      {clash && (
        <p className={`rounded-lg px-3 py-2 text-sm ${refused ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
          <i className="pi pi-ban mr-1.5 text-xs" aria-hidden />
          {fmtRange(clash.startDate, clash.endDate)} is blocked: {clash.reason}.
          {refused ? " Nobody can take time off then." : " You can still enter it as a super admin."}
        </p>
      )}
      {days !== null && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${overLimit ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-foreground/5"}`}
        >
          {days === 0 ? (
            "Only weekends or public holidays: nothing to take off."
          ) : (
            <>
              <strong>{fmtDays(days)}</strong> {kind === "vacation" && forMe && <>of your {fmtDays(vacationLeft)} left</>}
              {overLimit && " — that's more than you have left."}
            </>
          )}
        </p>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted">{instant ? "Goes on the calendar straight away." : "Waits for approval by your team leader or a super admin."}</span>
        <Button disabled={pending || !startDate || days === 0 || refused}>{pending ? "Saving…" : instant ? "Add" : "Send request"}</Button>
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

export function CancelTimeOffButton({ id, label = "Cancel" }: { id: number; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="small"
      text
      severity="danger"
      disabled={busy}
      label={busy ? "Cancelling…" : label}
      onClick={async () => {
        if (!confirm("Cancel this time off?")) return;
        setBusy(true);
        const r = await cancelTimeOff(id);
        setBusy(false);
        notify(r.ok ? { message: "Time off cancelled" } : { message: "Couldn't cancel it", detail: r.error, tone: "error" });
      }}
    />
  );
}

/** Approve straight away, or reject with a reason. */
export function DecideButtons({ id, name }: { id: number; name: string }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const decide = async (approve: boolean) => {
    setBusy(true);
    const r = await decideTimeOff(id, approve, approve ? undefined : reason);
    setBusy(false);
    if (r.ok) setRejecting(false);
    notify(
      r.ok
        ? { message: approve ? `Approved for ${name}` : `Rejected for ${name}` }
        : { message: "Couldn't save the decision", detail: r.error, tone: "error" },
    );
  };
  return (
    <span className="flex items-center gap-1.5">
      <Button size="small" icon="pi pi-check" label="Approve" disabled={busy} onClick={() => decide(true)} />
      <Button size="small" severity="secondary" outlined label="Reject" disabled={busy} onClick={() => setRejecting(true)} />
      {rejecting && (
        <Modal title={`Reject ${name}'s request`} onClose={() => setRejecting(false)}>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Why? They see this.
            <InputTextarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus className="w-full text-foreground" />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" severity="secondary" outlined label="Back" onClick={() => setRejecting(false)} />
            <Button severity="danger" label="Reject" disabled={busy || !reason.trim()} onClick={() => decide(false)} />
          </div>
        </Modal>
      )}
    </span>
  );
}
