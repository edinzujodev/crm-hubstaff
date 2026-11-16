"use client";

import { Menu } from "primereact/menu";
import type { MenuItem } from "primereact/menuitem";
import { useRef } from "react";
import { Button } from "@/components/ui";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean };

/** The ⋯ button at the end of a row, with a small PrimeReact menu. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const menu = useRef<Menu>(null);
  const model: MenuItem[] = items.map((item) => ({
    label: item.label,
    className: item.danger ? "text-red-600" : undefined,
    command: item.onSelect,
  }));

  return (
    <>
      <Button
        type="button"
        icon="pi pi-ellipsis-h"
        aria-label={label}
        aria-haspopup
        severity="secondary"
        text
        rounded
        onClick={(e) => menu.current?.toggle(e)}
      />
      <Menu model={model} popup ref={menu} appendTo="self" />
    </>
  );
}
