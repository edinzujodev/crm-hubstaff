"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Button, InputText } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { Modal } from "@/components/modal";
import { setAllowance } from "@/app/hr/actions";
import { notify } from "@/lib/toast";

export type AllowanceData = {
  userId: number;
  name: string;
  year: number;
  /** users.annual_leave_days */
  annual: number;
  /** Set by hand for this year (null: the default / worked out). */
  days: number | null;
  carriedOver: number | null;
  carryOverUntil: string | null;
  /** What the year uses when nothing is set by hand. */
  computedCarry: number;
};

function AllowanceForm({ data, onDone }: { data: AllowanceData; onDone: () => void }) {
  const [state, action, pending] = useActionState(setAllowance.bind(null, data.userId, data.year), null);
  const [until, setUntil] = useState(data.carryOverUntil ?? "");
  useEffect(() => {
    if (!state?.ok) return;
    notify({ message: `Vacation days saved for ${data.name}` });
    onDone();
  }, [state, onDone, data.name]);
  const field = "flex flex-col gap-1 text-xs font-medium text-muted";
  return (
    <form action={action} className="space-y-4">
      <label className={field}>
        Vacation days per year
        <InputText name="annual" defaultValue={String(data.annual)} inputMode="decimal" required className="w-full font-mono text-foreground" />
        <span className="font-normal">Used for every year that isn&apos;t set differently below.</span>
      </label>
      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold">Only {data.year}</legend>
        <label className={field}>
          Allowance in {data.year}
          <InputText
            name="days"
            defaultValue={data.days === null ? "" : String(data.days)}
            placeholder={`${data.annual} (default)`}
            inputMode="decimal"
            className="w-full font-mono text-foreground"
          />
          <span className="font-normal">For example fewer days for someone who started mid-year.</span>
        </label>
        <label className={field}>
          Carried over from {data.year - 1}
          <InputText
            name="carriedOver"
            defaultValue={data.carriedOver === null ? "" : String(data.carriedOver)}
            placeholder={`${data.computedCarry} (worked out)`}
            inputMode="decimal"
            className="w-full font-mono text-foreground"
          />
        </label>
        <label className={field}>
          Carried-over days expire after
          <DateInput name="carryOverUntil" value={until} onChange={(e) => setUntil(e.target.value)} className="w-full" />
          <span className="font-normal">Empty: 30 June {data.year}.</span>
        </label>
      </fieldset>
      <p className="text-xs text-muted">Leave a field empty to go back to the default.</p>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <div className="flex justify-end">
        <Button disabled={pending} label={pending ? "Saving…" : "Save"} />
      </div>
    </form>
  );
}

export function AllowanceButton({ data }: { data: AllowanceData }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button size="small" text icon="pi pi-pencil" aria-label={`Vacation days of ${data.name}`} title="Change vacation days" onClick={() => setOpen(true)} />
      {open && (
        <Modal title={`Vacation days · ${data.name}`} onClose={close}>
          <AllowanceForm data={data} onDone={close} />
        </Modal>
      )}
    </>
  );
}
