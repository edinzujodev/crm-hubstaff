"use client";

import { Button, InputText, InputTextarea } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { notify } from "@/lib/toast";
import { useActionState, useEffect, useState } from "react";
import { updateProfile } from "@/app/actions";

export type ProfileValues = {
  name: string;
  jobTitle: string;
  phone: string;
  birthDate: string;
  address: string;
  bio: string;
};

/** The person's own details. Saving shows a toast; the form tells you when there is something to save. */
export function ProfileForm({ initial, today }: { initial: ProfileValues; today: string }) {
  const [state, action, pending] = useActionState(updateProfile, null);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = (Object.keys(values) as (keyof ProfileValues)[]).some((k) => values[k] !== saved[k]);

  useEffect(() => {
    if (!state) return;
    if (state.ok) notify({ message: "Profile saved" });
    else notify({ message: "Couldn't save your profile", detail: state.error, tone: "error" });
  }, [state]);

  // Once a save went through, the submitted values are the new baseline.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.ok) setSaved(values);
  }

  const field = (k: keyof ProfileValues) => ({
    name: k,
    value: values[k],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value })),
  });

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Full name
          <InputText {...field("name")} required maxLength={120} className="w-full text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Job title
          <InputText {...field("jobTitle")} maxLength={120} placeholder="e.g. Bookkeeper" className="w-full text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Phone
          <InputText {...field("phone")} type="tel" maxLength={40} placeholder="+387 61 234 567" className="w-full text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Birth date
          <DateInput {...field("birthDate")} max={today} className="w-full" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          Address
          <InputText {...field("address")} maxLength={300} placeholder="Street, city" className="w-full text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
          About you
          <InputTextarea
            {...field("bio")}
            rows={3}
            autoResize
            maxLength={1000}
            placeholder="A few words for your colleagues"
            className="w-full text-foreground"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        {dirty && !pending && <span className="text-xs text-muted">Unsaved changes</span>}
        <Button type="button" severity="secondary" outlined disabled={!dirty || pending} onClick={() => setValues(saved)}>
          Discard
        </Button>
        <Button disabled={!dirty || pending || !values.name.trim()}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
