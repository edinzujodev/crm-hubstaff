"use client";

const KEY = "sidebar";

/**
 * Collapses the side menu to icons. The choice is kept in this browser; a small script in the page head applies
 * it before the first paint, and CSS does the rest (so the server and the browser render the same thing).
 */
export function SidebarToggle() {
  return (
    <button
      type="button"
      aria-label="Collapse or expand the menu"
      title="Collapse or expand the menu"
      onClick={() => {
        const root = document.documentElement;
        const next = root.dataset.sidebar !== "collapsed";
        if (next) root.dataset.sidebar = "collapsed";
        else delete root.dataset.sidebar;
        try {
          localStorage.setItem(KEY, next ? "collapsed" : "open");
        } catch {}
      }}
      className="sb-toggle hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-foreground md:flex"
    >
      <i aria-hidden className="pi pi-angle-double-left text-sm transition-transform" />
    </button>
  );
}

const THEMES = ["light", "dark", "blue"] as const;

/**
 * Cycles the whole page through three looks: light (dark menu), dark (light menu) and blue (the dark page, with
 * the menu in the same colour as the page).
 * Kept in this browser. The icon shows the look you are on.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Change the colours: light, dark or blue"
      title="Change the colours: light, dark or blue"
      onClick={() => {
        const root = document.documentElement;
        const now = (THEMES as readonly string[]).indexOf(root.dataset.theme ?? "light");
        const next = THEMES[(now + 1) % THEMES.length];
        root.dataset.theme = next;
        // Blue uses the dark page; only the menu differs.
        const dark = next !== "light";
        root.style.colorScheme = dark ? "dark" : "light";
        const light = document.getElementById("theme-light") as HTMLLinkElement | null;
        const darkLink = document.getElementById("theme-dark") as HTMLLinkElement | null;
        if (light) light.media = dark ? "not all" : "all";
        if (darkLink) darkLink.media = dark ? "all" : "not all";
        try {
          localStorage.setItem("theme", next);
        } catch {}
      }}
      className="sb-label sb-theme hidden h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-primary/10 hover:text-foreground md:flex"
    >
      <i aria-hidden className="pi pi-sun sb-theme-light text-sm" />
      <i aria-hidden className="pi pi-moon sb-theme-dark text-sm" />
      <i aria-hidden className="pi pi-palette sb-theme-blue text-sm" />
    </button>
  );
}
