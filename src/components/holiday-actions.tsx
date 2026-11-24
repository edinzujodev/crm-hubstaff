"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, Checkbox, InputText } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { addHoliday, deleteHoliday, hideBuiltInHoliday } from "@/app/hr/actions";
import { notify } from "@/lib/toast";

function AddHolidayForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(addHoliday, null);
  const [date, setDate] = useState("");
  useEffect(() => {
    if (!state?.ok) return;
    notify({ message: "Holiday added" });
    onDone();
  }, [state, onDone]);
  return (
    <form action={action} className="space-y-4">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Date
        <DateInput name="date" value={date} onChange={(e) => setDate(e.target.value)} required className="w-full" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Name
        <InputText name="name" required maxLength={120} placeholder="e.g. Company day off" className="w-full text-foreground" />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="dayOff" defaultChecked />
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
      <div className="flex justify-end">
        <Button disabled={pending || !date} label={pending ? "Adding…" : "Add holiday"} />
      </div>
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
          <AddHolidayForm onDone={close} />
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
  return (
    <Button
      size="small"
      text
      severity={action.kind === "delete" && label !== "Restore" ? "danger" : "secondary"}
      disabled={busy}
      label={label}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true);
        const r = action.kind === "delete" ? await deleteHoliday(action.id) : await hideBuiltInHoliday(action.date, action.name);
        setBusy(false);
        notify(r.ok ? { message: done } : { message: "Couldn't change it", detail: r.error, tone: "error" });
      }}
    />
  );
}
