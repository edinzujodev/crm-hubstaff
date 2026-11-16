"use client";

import { Column } from "primereact/column";
import { DataTable, type DataTableRowToggleEvent, type DataTableExpandedRows } from "primereact/datatable";
import { useState, type ReactNode } from "react";

export type GridRow = {
  key: string | number;
  /** One cell per header, in order. */
  cells: ReactNode[];
  /** Buttons at the end of the row. */
  actions?: ReactNode;
  /** Shown under the row when it is opened. A row with details gets an arrow. */
  details?: ReactNode;
};

export type GridHeader = string | { label: string; title?: string; align?: "right"; className?: string };

/**
 * A PrimeReact DataTable for rows whose cells are built on the server. Rows with details can be opened by
 * clicking them (links and buttons inside keep working).
 */
export function DataGrid({
  headers,
  rows,
  empty = "Nothing here.",
  actionsWidth,
  plain,
  noHeader,
}: {
  headers: GridHeader[];
  rows: GridRow[];
  empty?: ReactNode;
  actionsWidth?: string;
  /** No card around the table, for a grid inside another one. */
  plain?: boolean;
  noHeader?: boolean;
}) {
  const [expanded, setExpanded] = useState<DataTableExpandedRows>({});
  const expandable = rows.some((r) => r.details);
  const hasActions = rows.some((r) => r.actions);
  const toggle = (key: string | number) =>
    setExpanded((cur) => {
      const next = { ...cur };
      if (next[String(key)]) delete next[String(key)];
      else next[String(key)] = true;
      return next;
    });

  return (
    <div className={`${plain ? "" : "card overflow-hidden"} ${noHeader ? "[&_thead]:hidden" : ""}`}>
      <DataTable
        value={rows}
        dataKey="key"
        size="small"
        emptyMessage={empty}
        expandedRows={expanded}
        onRowToggle={(e: DataTableRowToggleEvent) => setExpanded(e.data as DataTableExpandedRows)}
        rowExpansionTemplate={(row: GridRow) => <div className="px-2 py-1">{row.details}</div>}
        onRowClick={(e) => {
          const target = e.originalEvent.target as HTMLElement;
          if (target.closest("a,button,select,input,dialog,.p-component:not(.p-datatable)")) return;
          const row = e.data as GridRow;
          if (row.details) toggle(row.key);
        }}
        rowClassName={(row: GridRow) => (row.details ? "cursor-pointer" : "")}
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
              body={(row: GridRow) => row.cells[i]}
            />
          );
        })}
        {hasActions && (
          <Column
            body={(row: GridRow) => <div className="flex items-center justify-end gap-2">{row.actions}</div>}
            style={{ width: actionsWidth }}
          />
        )}
      </DataTable>
    </div>
  );
}
