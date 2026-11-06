"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A popup. Render it only while it should be open; it closes on Escape or a click outside. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="card m-auto w-[28rem] max-w-[calc(100vw-2rem)] p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="space-y-4 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
