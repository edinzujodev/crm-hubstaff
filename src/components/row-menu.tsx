"use client";

import { useEffect, useRef, useState } from "react";

export type RowMenuItem = { label: string; onSelect: () => void; danger?: boolean };

/** The ⋯ button at the end of a row, with a small menu. */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
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
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        className="btn h-8 w-8 cursor-pointer justify-center px-0"
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
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`block w-full cursor-pointer px-3 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${item.danger ? "text-red-600" : ""}`}
              onClick={() => {
                setMenu(null);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
