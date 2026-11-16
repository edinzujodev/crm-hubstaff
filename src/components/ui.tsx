"use client";

import { Checkbox as PrimeCheckbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { Children, Fragment, isValidElement, useState, type ChangeEvent, type ReactNode } from "react";

type Opt = { value: string; label: string; disabled?: boolean };

/** Reads <option> children (also inside fragments and arrays) into an options list. */
function readOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
      if (child.type === "option") {
        const label = Children.toArray(props.children).join("");
        out.push({ value: String(props.value ?? label), label, disabled: props.disabled });
      } else if (child.type === Fragment || child.type === "optgroup") {
        walk(props.children);
      }
    });
  };
  walk(children);
  return out;
}

type SelectProps = {
  children: ReactNode;
  name?: string;
  id?: string;
  value?: string | number;
  defaultValue?: string | number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
};

/**
 * A PrimeReact dropdown that is used like a <select>: give it <option> children, a name for forms, and an
 * onChange that reads e.target.value. Works controlled (value) and uncontrolled (defaultValue).
 */
export function Select({
  children,
  name,
  id,
  value,
  defaultValue,
  required,
  disabled,
  className,
  title,
  onChange,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const options = readOptions(children);
  return (
    <>
      <Dropdown
        inputId={id}
        value={current}
        options={options}
        optionLabel="label"
        optionValue="value"
        optionDisabled="disabled"
        disabled={disabled}
        className={className}
        title={title}
        aria-label={ariaLabel}
        appendTo="self"
        onChange={(e) => {
          const next = String(e.value ?? "");
          if (value === undefined) setInner(next);
          onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as ChangeEvent<HTMLSelectElement>);
        }}
      />
      {name && <input type="hidden" name={name} value={current} required={required} />}
    </>
  );
}

type CheckboxProps = {
  name?: string;
  value?: string | number;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
  onChange?: (e: { target: { checked: boolean } }) => void;
};

/** A PrimeReact checkbox that is used like <input type="checkbox">: name/value for forms, onChange reads e.target.checked. */
export function Checkbox({ name, value, checked, defaultChecked, disabled, className, title, onChange, ...rest }: CheckboxProps) {
  const [inner, setInner] = useState(!!defaultChecked);
  const on = checked !== undefined ? checked : inner;
  return (
    <>
      <PrimeCheckbox
        checked={on}
        disabled={disabled}
        className={className}
        title={title}
        aria-label={rest["aria-label"]}
        onChange={(e) => {
          const next = !!e.checked;
          if (checked === undefined) setInner(next);
          onChange?.({ target: { checked: next } });
        }}
      />
      {name && on && <input type="hidden" name={name} value={value ?? "on"} />}
    </>
  );
}

export { InputText } from "primereact/inputtext";
export { InputTextarea } from "primereact/inputtextarea";
export { Button } from "primereact/button";
