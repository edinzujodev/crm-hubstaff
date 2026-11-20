"use client";

import { Column } from "primereact/column";
import { DataTable, type DataTableExpandedRows, type DataTableRowToggleEvent } from "primereact/datatable";
import { usePathname, useSearchParams } from "next/navigation";
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { InputText } from "@/components/ui";

export type GridRow = {
  key: string | number;
  /** One cell per header, in order. */
  cells: ReactNode[];
  /** Buttons at the end of the row. */
  actions?: ReactNode;
  /** Shown under the row when it is opened. A row with details gets an arrow. */
  details?: ReactNode;
  /** Values to sort each column by, when the text of the cell would sort wrongly (dates, for example). */
  sort?: (string | number | null | undefined)[];
  /** Extra words the search should match for this row (status, names behind icons, ...), beyond the cells' text. */
  search?: string;
  /** "critical" marks the row in red, "approaching" the same way in amber. */
  tone?: "critical" | "approaching" | "blocked";
};

export type GridHeader = string | { label: string; title?: string; align?: "right"; className?: string };

/** The visible text of a cell, so a column can be sorted and searched without every table spelling out its values. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; title?: unknown; "aria-label"?: unknown };
    const inner = Children.toArray(props.children).map(textOf).join(" ").trim();
    // A name behind an icon or initials (a title or label) is searchable too.
    const named = [props.title, props["aria-label"]].filter((v): v is string => typeof v === "string");
    return [inner, ...named].filter(Boolean).join(" ");
  }
  return "";
}

const asSortValue = (text: string): string | number => {
  const t = text.trim();
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : t.toLowerCase();
};

const PAGE = 20;
/** How long a removed row takes to fade and collapse (keep in step with `row-leaving` in globals.css). */
const LEAVE_MS = 350;

/**
 * A PrimeReact DataTable for rows whose cells are built on the server: click a header to sort, search the rows,
 * and page through long lists. Rows with details can be opened by clicking them (links and buttons inside keep working).
 */
export function DataGrid({
  headers,
  rows,
  empty = "Nothing here.",
  actionsWidth,
  plain,
  flush,
  noHeader,
  alwaysSearch,
  toolbar,
}: {
  headers: GridHeader[];
  rows: GridRow[];
  empty?: ReactNode;
  actionsWidth?: string;
  /** No card around the table, and no search box, for a grid inside another one. */
  plain?: boolean;
  /** No card around the table: it sits flush inside a box that already has one (like TabCard). */
  flush?: boolean;
  noHeader?: boolean;
  /** Show the search box even for short lists (normally only above 8 rows). */
  alwaysSearch?: boolean;
  /** Shown on the right of the search bar, in place of the row count. */
  toolbar?: ReactNode;
}) {
  const [expanded, setExpanded] = useState<DataTableExpandedRows>({});
  const [query, setQuery] = useState("");
  const expandable = rows.some((r) => r.details);
  const hasActions = rows.some((r) => r.actions);

  // Each row carries the text and the sort value of every cell.
  const prepared = useMemo(
    () =>
      rows.map((r) => {
        const texts = r.cells.map(textOf);
        const sortBy: Record<string, string | number> = {};
        texts.forEach((t, i) => {
          const given = r.sort?.[i];
          sortBy[`c${i}`] = given !== undefined && given !== null ? given : asSortValue(t);
        });
        return { ...r, _search: [...texts, r.search ?? ""].join(" ").toLowerCase(), _sort: sortBy };
      }),
    [rows],
  );

  // A row that disappears after an action (finish, delete, ...) is kept for a moment as a "ghost" that fades and
  // collapses, so the removal can be seen. Changing the list itself (another tab, filter or page) shows no ghosts.
  const pathname = usePathname();
  const view = `${pathname}?${useSearchParams().toString()}`;
  type Prepared = (typeof prepared)[number];
  const [seen, setSeen] = useState({ view, rows: prepared });
  const [ghosts, setGhosts] = useState<{ row: Prepared; at: number }[]>([]);
  if (seen.rows !== prepared) {
    const keys = new Set(prepared.map((r) => String(r.key)));
    const gone =
      seen.view === view
        ? seen.rows.flatMap((r, at) => (keys.has(String(r.key)) ? [] : [{ row: r, at }]))
        : [];
    setSeen({ view, rows: prepared });
    setGhosts(gone);
  }
  useEffect(() => {
    if (!ghosts.length) return;
    const t = setTimeout(() => setGhosts([]), LEAVE_MS);
    return () => clearTimeout(t);
  }, [ghosts]);

  const withGhosts = useMemo(() => {
    const list: (Prepared & { _leaving?: boolean })[] = [...prepared];
    for (const g of [...ghosts].sort((a, b) => a.at - b.at)) {
      list.splice(Math.min(g.at, list.length), 0, { ...g.row, _leaving: true });
    }
    return list;
  }, [prepared, ghosts]);
  // Every word typed must be found somewhere in the row, in any column ("edin zujo", "bingo weekly").
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? withGhosts.filter((r) => words.every((w) => r._search.includes(w))) : withGhosts;
  const searchable = !plain && !noHeader && (alwaysSearch || rows.length > 8);

  const toggle = (key: string | number) =>
    setExpanded((cur) => {
      const next = { ...cur };
      if (next[String(key)]) delete next[String(key)];
      else next[String(key)] = true;
      return next;
    });

  return (
    <div className={`${flush ? "" : plain ? "" : "card overflow-hidden"} ${noHeader ? "[&_thead]:hidden" : ""}`}>
      {searchable && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <InputText
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this list"
            aria-label="Search this list"
            className="w-64 max-w-full"
          />
          {toolbar ?? (
            <span className="text-xs text-muted">
              {shown.length === rows.length ? `${rows.length} rows` : `${shown.length - ghosts.length} of ${rows.length}`}
            </span>
          )}
        </div>
      )}
      <DataTable
        value={shown}
        dataKey="key"
        size="small"
        emptyMessage={query ? "Nothing matches your search." : empty}
        expandedRows={expanded}
        removableSort
        paginator={!plain && shown.length > PAGE}
        rows={PAGE}
        paginatorTemplate="PrevPageLink PageLinks NextPageLink"
        onRowToggle={(e: DataTableRowToggleEvent) => setExpanded(e.data as DataTableExpandedRows)}
        rowExpansionTemplate={(row: GridRow) => <div className="px-2 py-1">{row.details}</div>}
        onRowClick={(e) => {
          const target = e.originalEvent.target as HTMLElement;
          if (target.closest("a,button,select,input,dialog,.p-component:not(.p-datatable)")) return;
          const row = e.data as GridRow;
          if (row.details) toggle(row.key);
        }}
        rowClassName={(row: GridRow & { _leaving?: boolean }) =>
          `${row.details ? "cursor-pointer" : ""} ${row.tone ? `row-${row.tone}` : ""} ${row._leaving ? "row-leaving" : ""}`
        }
        tableStyle={{ minWidth: "100%" }}
      >
        {expandable && <Column expander={(row: GridRow) => !!row.details} style={{ width: "3rem" }} />}
        {headers.map((h, i) => {
          const header = typeof h === "string" ? { label: h } : h;
          return (
            <Column
              key={i}
              header={header.title ? <span title={header.title}>{header.label}</span> : header.label}
              align={header.align}
              className={header.className}
              sortable={!noHeader && header.label !== ""}
              sortField={`_sort.c${i}`}
              body={(row: GridRow & { _leaving?: boolean }) => (row._leaving ? <GhostCell>{row.cells[i]}</GhostCell> : row.cells[i])}
            />
          );
        })}
        {hasActions && (
          <Column
            body={(row: GridRow & { _leaving?: boolean }) => {
              const buttons = <div className="flex items-center justify-end gap-2">{row.actions}</div>;
              return row._leaving ? <GhostCell>{buttons}</GhostCell> : buttons;
            }}
            style={{ width: actionsWidth }}
          />
        )}
      </DataTable>
    </div>
  );
}

/** The content of a cell in a row that is leaving: it collapses in height while the row fades (see globals.css). */
function GhostCell({ children }: { children: ReactNode }) {
  return (
    <div className="ghost-cell">
      <div className="ghost-inner">{children}</div>
    </div>
  );
}
