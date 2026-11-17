"use client";

import { Menu } from "primereact/menu";
import type { MenuItem } from "primereact/menuitem";
import { useRef } from "react";
import { Button } from "@/components/ui";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean; icon?: string };

/** An icon for the common actions, so every ⋯ menu looks alike. A menu item can pass its own `icon`. */
function iconFor(item: RowMenuItem): string | undefined {
  if (item.icon) return item.icon;
  const l = item.label.toLowerCase();
  if (l.startsWith("view")) return "pi pi-eye";
  if (l.startsWith("edit")) return "pi pi-pencil";
  if (l.startsWith("delete")) return "pi pi-trash";
  if (l.startsWith("restore")) return "pi pi-replay";
  return undefined;
}

/** The ⋯ button at the end of a row, with a small PrimeReact menu. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const menu = useRef<Menu>(null);
  const model: MenuItem[] = items.map((item) => ({
    label: item.label,
    icon: iconFor(item),
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
      <Menu model={model} popup ref={menu} appendTo={typeof document === "undefined" ? undefined : document.body} />
    </>
  );
}
