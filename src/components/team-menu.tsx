"use client";

import { useEffect, useRef, useState } from "react";
import { deleteTeam } from "@/app/actions";
import { HoldToDelete } from "@/components/hold-to-delete";
import { Modal } from "@/components/modal";

/** The ⋯ button at the end of a team row. Its menu has Delete, which asks for a press-and-hold. */
export function TeamMenu({ teamId, name }: { teamId: number; name: string }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  // Close the menu on any outside click, scroll, resize or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggle = () => {
    if (menu) return setMenu(null);
    const r = button.current!.getBoundingClientRect();
    setMenu({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className="btn cursor-pointer px-2"
        // The window's pointerdown closes the menu; stop it so this click can toggle it.
        onPointerDown={(e) => e.nativeEvent.stopImmediatePropagation()}
        onClick={toggle}
      >
        ⋯
      </button>
      {menu && (
        <div
          role="menu"
          style={{ top: menu.top, right: menu.right }}
          className="card fixed z-40 w-36 py-1 text-sm shadow-lg"
          onPointerDown={(e) => e.nativeEvent.stopImmediatePropagation()}
        >
          <button
            role="menuitem"
            className="block w-full cursor-pointer px-3 py-1.5 text-left text-red-600 hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => {
              setMenu(null);
              setConfirm(true);
            }}
          >
            Delete
          </button>
        </div>
      )}
      {confirm && (
        <Modal title="Delete team?" onClose={() => setConfirm(false)}>
          <p className="text-sm">
            Delete <span className="font-medium">{name}</span>?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <HoldToDelete title={name} action={() => deleteTeam(teamId)} />
          </div>
        </Modal>
      )}
    </>
  );
}
