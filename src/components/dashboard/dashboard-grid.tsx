"use client";

import { Button, Select } from "@/components/ui";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/modal";
import { useConfirm } from "@/components/confirm-modal";
import { WidgetForm, type Lookups } from "@/components/dashboard/widget-form";
import type { Role } from "@/lib/auth";
import {
  LAYOUTS,
  LAYOUT_KEYS,
  MAX_SECTIONS,
  WIDGETS,
  presetsFor,
  widgetsFor,
  type AnyConfig,
  type Layout,
  type Preset,
  type WidgetType,
} from "@/lib/dashboard/config";
import { addWidget, removeWidget, resetDashboard, saveLayout, updateWidget } from "@/app/dashboard/actions";

export type GridItem = {
  id: number;
  type: WidgetType;
  /** The row of the dashboard the widget is in; 0 is the top one. */
  section: number;
  /** The column within that row; 0 is the left one. */
  column: number;
  /** The heading shown: the custom title, or one built from the settings. */
  title: string;
  customTitle: string | null;
  config: AnyConfig;
  /** The widget's content, rendered on the server. */
  body: ReactNode;
};

type Result = { ok: true } | { ok: false; error: string };
/** One row of the dashboard: its column layout, and the widget ids in each column from top to bottom. */
type Section = { layout: Layout; cols: number[][] };

const colId = (s: number, c: number) => `col-${s}-${c}`;
const parseColId = (id: unknown): [number, number] | null => {
  const m = typeof id === "string" ? /^col-(\d+)-(\d+)$/.exec(id) : null;
  return m ? [Number(m[1]), Number(m[2])] : null;
};

/** Rows with their columns. A widget in a row or column that no longer exists goes in the last one. */
function toSections(items: GridItem[], layouts: Layout[]): Section[] {
  const sections: Section[] = layouts.map((layout) => ({
    layout,
    cols: Array.from({ length: LAYOUTS[layout].count }, () => []),
  }));
  for (const item of items) {
    const s = sections[Math.min(Math.max(item.section, 0), sections.length - 1)];
    s.cols[Math.min(Math.max(item.column, 0), s.cols.length - 1)].push(item.id);
  }
  return sections;
}

/** The position of a widget id, or of a column id, as [row, column]. */
function locate(id: unknown, sections: Section[]): [number, number] | null {
  const col = parseColId(id);
  if (col) return col;
  for (const [s, section] of sections.entries()) {
    const c = section.cols.findIndex((ids) => ids.includes(Number(id)));
    if (c >= 0) return [s, c];
  }
  return null;
}

const toPayload = (sections: Section[]) => sections.map((s) => ({ layout: s.layout, columns: s.cols }));

function Frame({
  item,
  editing,
  busy,
  onConfigure,
  onRemove,
}: {
  item: GridItem;
  editing: boolean;
  busy: boolean;
  onConfigure: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editing,
  });
  const [confirming, setConfirming] = useState(false);
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      aria-label={item.title}
      className={`card @container relative min-w-0 p-4 ${editing ? "outline-1 outline-dashed outline-border" : ""} ${isDragging ? "z-10" : ""}`}
    >
      <header className="mb-3 flex items-center gap-2">
        {editing && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="-ml-1 cursor-grab touch-none rounded px-1 text-muted hover:text-foreground active:cursor-grabbing"
            aria-label={`Move ${item.title}. Press space, then use the arrow keys.`}
            title="Drag to move"
          >
            ⠿
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate font-semibold" title={item.title}>
          {item.title}
        </h2>
        {editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="small"
              severity="secondary"
              outlined

              onClick={onConfigure}
              aria-label={`Settings for ${item.title}`}
            >
              Edit
            </Button>
            {confirming ? (
              <>
                <Button
                  type="button"
                  size="small"
                  severity="danger"

                  onClick={onRemove}
                  disabled={busy}
                >
                  Remove
                </Button>
                <Button
                  type="button"
                  size="small"
                  severity="secondary"
                  outlined

                  onClick={() => setConfirming(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="small"
                severity="secondary"
                outlined

                onClick={() => setConfirming(true)}
                aria-label={`Remove ${item.title}`}
              >
                ✕
              </Button>
            )}
          </div>
        )}
      </header>
      {item.body}
    </section>
  );
}

/** One column: its widgets stack top to bottom, and a widget can be dropped on it, even when it is empty. */
function Column({
  section,
  index,
  ids,
  byId,
  editing,
  busy,
  onConfigure,
  onRemove,
}: {
  section: number;
  index: number;
  ids: number[];
  byId: Map<number, GridItem>;
  editing: boolean;
  busy: boolean;
  onConfigure: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(section, index) });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 space-y-4 rounded-lg ${editing ? "min-h-24 p-1" : ""} ${editing && isOver ? "bg-primary/5" : ""}`}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => {
          const item = byId.get(id);
          return item ? (
            <Frame
              key={id}
              item={item}
              editing={editing}
              busy={busy}
              onConfigure={() => onConfigure(id)}
              onRemove={() => onRemove(id)}
            />
          ) : null;
        })}
      </SortableContext>
      {editing && ids.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Drop a widget here
        </p>
      )}
    </div>
  );
}

export function DashboardGrid({
  items,
  layouts: savedLayouts,
  role,
  lookups,
}: {
  items: GridItem[];
  layouts: Layout[];
  role: Role;
  lookups: Lookups;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [configuring, setConfiguring] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [ask, confirmModal] = useConfirm();

  // Local rows make drags feel instant; the server's version wins whenever it changes.
  const serverSections = toSections(items, savedLayouts);
  const serverKey = JSON.stringify(serverSections);
  const [sections, setSections] = useState(serverSections);
  const [seen, setSeen] = useState(serverKey);
  const [startSections, setStartSections] = useState<Section[] | null>(null);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setSections(serverSections);
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const total = sections.reduce((n, s) => n + s.cols.reduce((m, c) => m + c.length, 0), 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function act(fn: () => Promise<Result>, onDone?: () => void, onFail?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) onDone?.();
      else {
        setError(r.error);
        onFail?.();
      }
    });
  }

  /** Shows `next` straight away and saves it; puts `before` back if the save fails. */
  function commit(next: Section[], before: Section[]) {
    setSections(next);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    act(
      () => saveLayout(toPayload(next)),
      undefined,
      () => setSections(before),
    );
  }

  // Moving over another column puts the widget in it straight away, so it can be placed between that column's widgets.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = Number(active.id);
    setSections((prev) => {
      const from = locate(active.id, prev);
      const to = locate(over.id, prev);
      if (!from || !to || (from[0] === to[0] && from[1] === to[1])) return prev;
      const target = prev[to[0]].cols[to[1]];
      let index = target.length;
      if (!parseColId(over.id)) {
        const overIndex = target.indexOf(Number(over.id));
        const translated = active.rect.current.translated;
        const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
        index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      }
      return prev.map((section, s) => ({
        ...section,
        cols: section.cols.map((ids, c) => {
          if (s === from[0] && c === from[1]) return ids.filter((id) => id !== activeId);
          if (s === to[0] && c === to[1]) return [...ids.slice(0, index), activeId, ...ids.slice(index)];
          return ids;
        }),
      }));
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const before = startSections ?? sections;
    setStartSections(null);
    let next = sections;
    if (over && !parseColId(over.id)) {
      const at = locate(active.id, sections);
      if (at) {
        const ids = sections[at[0]].cols[at[1]];
        const from = ids.indexOf(Number(active.id));
        const to = ids.indexOf(Number(over.id));
        if (from >= 0 && to >= 0 && from !== to) {
          next = sections.map((section, s) => ({
            ...section,
            cols: section.cols.map((c, ci) => (s === at[0] && ci === at[1] ? arrayMove(c, from, to) : c)),
          }));
        }
      }
    }
    commit(next, before);
  }

  /** Changes how many columns a row has. Widgets from columns that no longer exist go to the bottom of the last one. */
  function changeLayout(index: number, layout: Layout) {
    const before = sections;
    const count = LAYOUTS[layout].count;
    const current = sections[index].cols;
    const cols = Array.from({ length: count }, (_, i) => current[i] ?? []);
    cols[count - 1] = [...cols[count - 1], ...current.slice(count).flat()];
    commit(
      sections.map((s, i) => (i === index ? { layout, cols } : s)),
      before,
    );
  }

  function addSection() {
    if (sections.length >= MAX_SECTIONS) return setError(`A dashboard holds up to ${MAX_SECTIONS} rows.`);
    commit([...sections, { layout: "2", cols: [[], []] }], sections);
  }

  /** Removes a row; its widgets move to the bottom of the last column of the row above (or below, for the first). */
  function removeSection(index: number) {
    if (sections.length <= 1) return;
    const before = sections;
    const widgets = sections[index].cols.flat();
    const rest = sections.filter((_, i) => i !== index);
    const heir = index === 0 ? 0 : index - 1;
    const next = rest.map((s, i) =>
      i === heir ? { ...s, cols: s.cols.map((c, ci) => (ci === s.cols.length - 1 ? [...c, ...widgets] : c)) } : s,
    );
    commit(next, before);
  }

  const configuringItem = configuring === null ? null : (byId.get(configuring) ?? null);

  return (
    <div className="space-y-4">
      {confirmModal}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h1 className="sr-only">Dashboard</h1>
        {editing && (
          <>
            <Button severity="secondary" outlined onClick={() => setAdding(true)}>
              + Add widget
            </Button>
            <Button
              severity="secondary"
              outlined
              disabled={pending}
              onClick={async () => {
                const sure = await ask({
                  title: "Reset your dashboard?",
                  message: "Your widgets are replaced with the default layout for your role.",
                  confirmLabel: "Reset",
                });
                if (sure) act(() => resetDashboard());
              }}
            >
              Reset to default
            </Button>
          </>
        )}
        <Button className={editing ? "" : ""} onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Customize"}
        </Button>
      </div>

      {error && (
        <p
          role="alert"
          className="card flex items-center justify-between gap-3 border-red-500/50 p-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
          <Button link size="small" className="p-0" onClick={() => setError(null)}>
            Dismiss
          </Button>
        </p>
      )}

      {total === 0 && !editing ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="font-medium">Your dashboard is empty.</p>
          <p className="text-sm text-muted">Add the reports and lists you want to see here.</p>
          <Button
            className="mx-auto"
            onClick={() => {
              setEditing(true);
              setAdding(true);
            }}
          >
            + Add widget
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={() => setStartSections(sections)}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <div className="space-y-4">
            {sections.map((section, s) => {
              const empty = section.cols.every((c) => c.length === 0);
              // An empty row is only shown while customizing, as somewhere to drop widgets.
              if (empty && !editing) return null;
              return (
                <div key={s} className="space-y-2">
                  {editing && (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                      <span className="font-medium text-foreground">Row {s + 1}</span>
                      <Select
                        aria-label={`Columns in row ${s + 1}`}
                        className="w-full text-foreground"
                        value={section.layout}
                        disabled={pending}
                        onChange={(e) => changeLayout(s, e.target.value as Layout)}
                      >
                        {LAYOUT_KEYS.map((k) => (
                          <option key={k} value={k}>
                            {LAYOUTS[k].label}
                          </option>
                        ))}
                      </Select>
                      {sections.length > 1 && (
                        <Button
                          type="button"
                          size="small"
                          severity="secondary"
                          outlined

                          disabled={pending}
                          onClick={() => removeSection(s)}
                          title="Remove this row. Its widgets move to the row above."
                        >
                          Remove row
                        </Button>
                      )}
                    </div>
                  )}
                  <div className={`grid grid-cols-1 items-start gap-4 ${LAYOUTS[section.layout].class}`}>
                    {section.cols.map((ids, c) => (
                      <Column
                        key={c}
                        section={s}
                        index={c}
                        ids={ids}
                        byId={byId}
                        editing={editing}
                        busy={pending}
                        onConfigure={setConfiguring}
                        onRemove={async (id) => {
                          const sure = await ask({
                            title: "Remove this widget?",
                            message: "It comes off your dashboard. You can add it again with “Add widget”.",
                            confirmLabel: "Remove",
                          });
                          if (sure) act(() => removeWidget(id));
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {editing && (
              <Button
                type="button"
                className="w-full justify-center border-dashed"
                severity="secondary"
                outlined
                onClick={addSection}
                disabled={pending}
              >
                + Add row
              </Button>
            )}
          </div>
        </DndContext>
      )}

      {configuringItem && (
        <Modal title={`Edit ${WIDGETS[configuringItem.type].label.toLowerCase()}`} onClose={() => setConfiguring(null)}>
          <WidgetForm
            type={configuringItem.type}
            role={role}
            initial={configuringItem.config}
            initialTitle={configuringItem.customTitle}
            lookups={lookups}
            submitLabel="Save"
            pending={pending}
            onCancel={() => setConfiguring(null)}
            onSubmit={(config, title) =>
              act(
                () => updateWidget(configuringItem.id, { config, title }),
                () => setConfiguring(null),
              )
            }
          />
        </Modal>
      )}

      {adding && (
        <AddWidget
          role={role}
          lookups={lookups}
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(type, config, title) =>
            act(
              () => addWidget({ type, config, title }),
              () => setAdding(false),
            )
          }
        />
      )}
    </div>
  );
}

function AddWidget({
  role,
  lookups,
  pending,
  onClose,
  onAdd,
}: {
  role: Role;
  lookups: Lookups;
  pending: boolean;
  onClose: () => void;
  onAdd: (type: WidgetType, config: AnyConfig, title: string | null) => void;
}) {
  const [picked, setPicked] = useState<{ type: WidgetType; preset: Preset } | null>(null);

  if (picked) {
    return (
      <Modal title={picked.preset.label} onClose={onClose}>
        <p className="text-sm text-muted">{picked.preset.description}</p>
        <WidgetForm
          type={picked.type}
          role={role}
          initial={picked.preset.config}
          initialTitle={null}
          lookups={lookups}
          submitLabel="Add to dashboard"
          pending={pending}
          onCancel={() => setPicked(null)}
          onSubmit={(config, title) => onAdd(picked.type, config, title)}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Add a widget" onClose={onClose}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {widgetsFor(role).map((type) => (
          <div key={type} className="space-y-1">
            <h3 className="text-sm font-medium">{WIDGETS[type].label}</h3>
            <p className="text-xs text-muted">{WIDGETS[type].description}</p>
            <ul className="space-y-1 pt-1">
              {presetsFor(type, role).map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-primary/5"
                    onClick={() => setPicked({ type, preset })}
                  >
                    <span className="block font-medium">{preset.label}</span>
                    <span className="block text-xs text-muted">{preset.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button severity="secondary" outlined onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
