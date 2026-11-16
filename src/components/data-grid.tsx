"use client";

import { Column } from "primereact/column";
import { DataTable, type DataTableExpandedRows, type DataTableRowToggleEvent } from "primereact/datatable";
import { Children, isValidElement, useMemo, useState, type ReactNode } from "react";
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
  /** "critical" marks the row in red, "approaching" the same way in amber. */
  tone?: "critical" | "approaching";
};

export type GridHeader = string | { label: string; title?: string; align?: "right"; className?: string };

/** The visible text of a cell, so a column can be sorted and searched without every table spelling out its values. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode; title?: unknown };
    const inner = Children.toArray(props.children).map(textOf).join(" ").trim();
    return inner || (typeof props.title === "string" ? props.title : "");
  }
  return "";
}

const asSortValue = (text: string): string | number => {
  const t = text.trim();
  return /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(",", ".")) : t.toLowerCase();
};

const PAGE = 20;

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
        return { ...r, _search: texts.join(" ").toLowerCase(), _sort: sortBy };
      }),
    [rows],
  );
  const shown = query.trim() ? prepared.filter((r) => r._search.includes(query.trim().toLowerCase())) : prepared;
  const searchable = !plain && !noHeader && rows.length > 8;

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
          <span className="text-xs text-muted">
            {shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length}`}
          </span>
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
        rowClassName={(row: GridRow) => `${row.details ? "cursor-pointer" : ""} ${row.tone ? `row-${row.tone}` : ""}`}
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
              body={(row: GridRow) => row.cells[i]}
            />
          );
        })}
        {hasActions && (
          <Column body={(row: GridRow) => <div className="flex items-center justify-end gap-2">{row.actions}</div>} style={{ width: actionsWidth }} />
        )}
      </DataTable>
    </div>
  );
}
