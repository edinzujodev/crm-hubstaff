"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
} from "react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-modal";
import { cancelTimeOff } from "@/app/hr/actions";
import { fmtDays, fmtRange } from "@/lib/days";
import { KIND_LABEL, statusLabel, type TimeOffStatus } from "@/lib/leave-days";
import { notify } from "@/lib/toast";
import {
  TimeOffForm,
  type TimeOffEdit,
  type TimeOffFormContext,
} from "@/components/time-off";

/**
 * What the change form needs (holidays, blocked days, who is signed in), given once for a whole page so every
 * entry on it can open the form.
 */
const FormContext = createContext<TimeOffFormContext | null>(null);

export function TimeOffFormProvider({
  value,
  children,
}: {
  value: TimeOffFormContext;
  children: React.ReactNode;
}) {
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

/** Time off that the viewer may change or cancel. */
export type ManagedTimeOff = TimeOffEdit & {
  status: TimeOffStatus;
  days?: number;
};

/** The window for one person's time off: what it is, then Change or Cancel. Either one sends them a notification. */
function ManageTimeOff({
  t,
  startEditing,
  onClose,
}: {
  t: ManagedTimeOff;
  startEditing: boolean;
  onClose: () => void;
}) {
  const form = useContext(FormContext);
  const [editing, setEditing] = useState(startEditing);
  const [busy, startTransition] = useTransition();
  const own = form?.me.id === t.userId;
  const [ask, confirmModal] = useConfirm();

  const cancel = async () => {
    const sure = await ask({
      title: own ? "Cancel your time off?" : `Cancel ${t.name}'s ${KIND_LABEL[t.kind].toLowerCase()}?`,
      message: `${fmtRange(t.startDate, t.endDate)} comes off the calendar${own ? "." : `, and ${t.name} gets a notification.`}`,
      confirmLabel: "Cancel time off",
      cancelLabel: "Keep it",
    });
    if (!sure) return;
    startTransition(async () => {
      const r = await cancelTimeOff(t.id);
      notify(
        r.ok
          ? {
              message: "Time off cancelled",
              detail: own ? undefined : `${t.name} gets a notification.`,
            }
          : { message: "Couldn't cancel it", detail: r.error, tone: "error" },
      );
      if (r.ok) onClose();
    });
  };

  if (editing && form) {
    return (
      <Modal
        title={`Change ${own ? "your" : `${t.name}'s`} time off`}
        onClose={onClose}
      >
        <TimeOffForm {...form} editing={t} onDone={onClose} />
      </Modal>
    );
  }
  return (
    <Modal title={`${t.name} · ${KIND_LABEL[t.kind]}`} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Dates</dt>
        <dd>
          {fmtRange(t.startDate, t.endDate)}
          {t.halfDay && <span className="text-muted"> · half day</span>}
          {t.days !== undefined && (
            <span className="text-muted"> · {fmtDays(t.days)}</span>
          )}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd>{statusLabel(t.kind, t.status)}</dd>
        {t.note && (
          <>
            <dt className="text-muted">Note</dt>
            <dd className="whitespace-pre-wrap">{t.note}</dd>
          </>
        )}
      </dl>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted">
          {own ? "" : `${t.name} is notified of any change.`}
        </span>
        <span className="flex gap-2">
          <Button
            type="button"
            severity="danger"
            outlined
            disabled={busy}
            label={busy ? "Cancelling…" : "Cancel time off"}
            onClick={() => void cancel()}
          />
          {form && (
            <Button
              type="button"
              icon="pi pi-pencil"
              disabled={busy}
              label="Change"
              onClick={() => setEditing(true)}
            />
          )}
        </span>
      </div>
      {confirmModal}
    </Modal>
  );
}

/** A day of someone's time off in the Time off grid, as a button that opens it. */
export function GridEntryButton({
  t,
  title,
  className,
}: {
  t: ManagedTimeOff;
  title: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
        className={`${className} cursor-pointer hover:brightness-110 focus-visible:outline-2`}
      />
      {open && <ManageTimeOff t={t} startEditing={false} onClose={close} />}
    </>
  );
}

/** "Change" in a list row: opens the form straight away. */
export function ChangeTimeOffButton({ t }: { t: ManagedTimeOff }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button size="small" text label="Change" onClick={() => setOpen(true)} />
      {open && <ManageTimeOff t={t} startEditing onClose={close} />}
    </>
  );
}
