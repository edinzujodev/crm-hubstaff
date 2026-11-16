"use client";

import { Dialog } from "primereact/dialog";
import type { ReactNode } from "react";

/** A popup. Render it only while it should be open; it closes on Escape or a click outside. */
export function Modal({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      visible
      modal
      draggable={false}
      resizable={false}
      dismissableMask
      header={title}
      onHide={onClose}
      style={{ width: wide ? "40rem" : "28rem", maxWidth: "calc(100vw - 2rem)" }}
    >
      <div className="space-y-4">{children}</div>
    </Dialog>
  );
}
