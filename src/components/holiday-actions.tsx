"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, Checkbox, InputText } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-modal";
import { addBlockedPeriod, addHoliday, deleteBlockedPeriod, deleteHoliday, hideBuiltInHoliday, updateHoliday } from "@/app/hr/actions";
import { notify } from "@/lib/toast";

/** A holiday as the edit form needs it. Built-in ones have no id. */
export type HolidayEdit = { date: string; name: string; dayOff: boolean; source: "built-in" | "custom"; id?: number };

/** Add a holiday, or change one (a built-in holiday is replaced by the changed copy for that year). */
export function HolidayForm({ holiday, onDone }: { holiday?: HolidayEdit; onDone: () => void }) {
  const save = holiday
    ? updateHoliday.bind(
        null,
        holiday.source === "custom" ? { kind: "custom", id: holiday.id! } : { kind: "built-in", date: holiday.date, name: holiday.name },
      )
    : addHoliday;
  const [state, action, pending] = useActionState(save, null);
  const [date, setDate] = useState(holiday?.date ?? "");
  const [removing, setRemoving] = useState(false);
  const [ask, confirmModal] = useConfirm();
  useEffect(() => {
    if (!state?.ok) return;
    notify({ message: holiday ? "Holiday saved" : "Holiday added" });
    onDone();
  }, [state, onDone, holiday]);

  const remove = async () => {
    if (!holiday) return;
    const builtIn = holiday.source === "built-in";
    const sure = await ask(
      builtIn
        ? {
            title: `Remove ${holiday.name}?`,
            message: `It comes off the calendar for ${holiday.date.slice(0, 4)}. You can bring it back on the Holidays page.`,
            confirmLabel: "Remove",
          }
        : { title: `Delete ${holiday.name}?`, message: "It comes off the calendar.", confirmLabel: "Delete" },
    );
    if (!sure) return;
    setRemoving(true);
    const r = builtIn ? await hideBuiltInHoliday(holiday.date, holiday.name) : await deleteHoliday(holiday.id!);
    setRemoving(false);
    notify(r.ok ? { message: builtIn ? `${holiday.name} removed` : "Holiday deleted" } : { message: "Couldn't change it", detail: r.error, tone: "error" });
    if (r.ok) onDone();
  };

  return (
    <form action={action} className="space-y-4">
      {holiday?.source === "built-in" && (
        <p className="rounded-lg bg-foreground/5 px-3 py-2 text-xs text-muted">
          A built-in holiday. Saving changes it for {holiday.date.slice(0, 4)} only; other years keep the usual date.
        </p>
      )}
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Date
        <DateInput name="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Name
        <InputText name="name" defaultValue={holiday?.name} required maxLength={120} placeholder="e.g. Company day off" className="w-full text-foreground" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="dayOff" defaultChecked={holiday ? holiday.dayOff : true} />
        <span>
          Day off for everyone
          <span className="block text-xs text-muted">Skipped when counting leave. Untick for a religious holiday people book themselves.</span>
        </span>
      </label>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        {holiday ? (
          <Button
            type="button"
            text
            severity="danger"
            disabled={removing}
            label={removing ? "Removing…" : holiday.source === "built-in" ? "Remove this year" : "Delete"}
            onClick={remove}
          />
        ) : null}
        <Button disabled={pending || !date} label={pending ? "Saving…" : "Save"} />
      </div>
      {confirmModal}
    </form>
  );
}

export function AddHolidayButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button icon="pi pi-plus" label="Add holiday" onClick={() => setOpen(true)} />
      {open && (
        <Modal title="Add a holiday" onClose={close}>
          <HolidayForm onDone={close} />
        </Modal>
      )}
    </>
  );
}

/** The holiday's name as a button that opens its edit form (super admins). */
export function EditHolidayButton({ holiday }: { holiday: HolidayEdit }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="cursor-pointer text-left font-medium hover:underline" title="Edit this holiday">
        {holiday.name}
      </button>
      {open && (
        <Modal title="Edit holiday" onClose={close}>
          <HolidayForm holiday={holiday} onDone={close} />
        </Modal>
      )}
    </>
  );
}

/** Remove a custom holiday or a built-in one (for that year), or bring a hidden built-in one back. */
export function HolidayButton({
  action,
  label,
  done,
  confirmText,
}: {
  action: { kind: "delete"; id: number } | { kind: "hide"; date: string; name: string };
  label: string;
  done: string;
  confirmText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [ask, confirmModal] = useConfirm();
  return (
    <>
    <Button
      size="small"
      text
      severity={action.kind === "delete" && label !== "Restore" ? "danger" : "secondary"}
      disabled={busy}
      label={label}
      onClick={async () => {
        if (
          confirmText &&
          !(await ask({
            title: confirmText,
            message: action.kind === "hide" ? "It comes off the calendar for this year. You can bring it back at the bottom of this page." : "It comes off the calendar.",
            confirmLabel: label,
          }))
        )
          return;
        setBusy(true);
        const r = action.kind === "delete" ? await deleteHoliday(action.id) : await hideBuiltInHoliday(action.date, action.name);
        setBusy(false);
        notify(r.ok ? { message: done } : { message: "Couldn't change it", detail: r.error, tone: "error" });
      }}
    />
    {confirmModal}
    </>
  );
}

function BlockDaysForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(addBlockedPeriod, null);
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  useEffect(() => {
    if (!state?.ok) return;
    const n = state.data.affected;
    notify({
      message: "Days blocked",
      detail: n ? `${n} ${n === 1 ? "request is" : "requests are"} already on those days. They aren't cancelled; check them under Approvals.` : undefined,
    });
    onDone();
  }, [state, onDone]);
  const end = endDate || startDate;
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          First day
          <DateInput
            name="startDate"
            value={startDate}
            onChange={(e) => {
              const d = e.target.value;
              setStart(d);
              // A later first day moves the last day along with it.
              if (endDate && d && endDate < d) setEnd(d);
            }}
            required
            className="w-full"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Last day
          <DateInput name="endDate" value={end} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} className="w-full" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Why
        <InputText name="reason" required maxLength={200} placeholder="e.g. Product launch" className="w-full text-foreground" />
      </label>
      <p className="text-xs text-muted">
        Nobody can ask for time off on these days, and team leaders can&apos;t approve requests for them. Sick leave can
        still be recorded, and super admins can still enter time off.
      </p>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button disabled={pending || !startDate} label={pending ? "Blocking…" : "Block days"} />
      </div>
    </form>
  );
}

export function BlockDaysButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button icon="pi pi-ban" label="Block days" severity="secondary" outlined onClick={() => setOpen(true)} />
      {open && (
        <Modal title="Block days for time off" onClose={close}>
          <BlockDaysForm onDone={close} />
        </Modal>
      )}
    </>
  );
}

export function UnblockButton({ id, what, onDone }: { id: number; what: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [ask, confirmModal] = useConfirm();
  return (
    <>
    <Button
      size="small"
      text
      severity="danger"
      disabled={busy}
      label="Unblock"
      onClick={async () => {
        const sure = await ask({ title: `Unblock ${what}?`, message: "People can ask for time off on these days again.", confirmLabel: "Unblock" });
        if (!sure) return;
        setBusy(true);
        const r = await deleteBlockedPeriod(id);
        setBusy(false);
        notify(r.ok ? { message: "Days unblocked" } : { message: "Couldn't unblock them", detail: r.error, tone: "error" });
        if (r.ok) onDone?.();
      }}
    />
    {confirmModal}
    </>
  );
}
