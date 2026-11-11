"use client";

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
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/modal";
import { WidgetForm, type Lookups } from "@/components/dashboard/widget-form";
import type { Role } from "@/lib/auth";
import {
  LAYOUTS,
  LAYOUT_KEYS,
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
  /** The column the widget is in; 0 is the left one. */
  column: number;
  /** The heading shown: the custom title, or one built from the settings. */
  title: string;
  customTitle: string | null;
  config: AnyConfig;
  /** The widget's content, rendered on the server. */
  body: ReactNode;
};

type Result = { ok: true } | { ok: false; error: string };

const colId = (i: number) => `col-${i}`;
const isColId = (id: unknown): id is string => typeof id === "string" && id.startsWith("col-");

/** Widget ids per column, top to bottom. A widget in a column the layout no longer has goes in the last one. */
function toColumns(items: GridItem[], count: number): number[][] {
  const cols: number[][] = Array.from({ length: count }, () => []);
  for (const item of items) cols[Math.min(Math.max(item.column, 0), count - 1)].push(item.id);
  return cols;
}

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
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

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
            <button type="button" className="btn px-2 py-1 text-xs" onClick={onConfigure} aria-label={`Settings for ${item.title}`}>
              Edit
            </button>
            {confirming ? (
              <>
                <button type="button" className="btn btn-danger px-2 py-1 text-xs" onClick={onRemove} disabled={busy}>
                  Remove
                </button>
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn px-2 py-1 text-xs"
                onClick={() => setConfirming(true)}
                aria-label={`Remove ${item.title}`}
              >
                ✕
              </button>
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
  index,
  ids,
  byId,
  editing,
  busy,
  onConfigure,
  onRemove,
}: {
  index: number;
  ids: number[];
  byId: Map<number, GridItem>;
  editing: boolean;
  busy: boolean;
  onConfigure: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(index) });
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
  layout: savedLayout,
  role,
  lookups,
}: {
  items: GridItem[];
  layout: Layout;
  role: Role;
  lookups: Lookups;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [configuring, setConfiguring] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  // Local columns make drags feel instant; the server's version wins whenever it changes.
  const serverKey = `${savedLayout}|${JSON.stringify(toColumns(items, LAYOUTS[savedLayout].count))}`;
  const [layout, setLayout] = useState<Layout>(savedLayout);
  const [cols, setCols] = useState(() => toColumns(items, LAYOUTS[savedLayout].count));
  const [seen, setSeen] = useState(serverKey);
  const [startCols, setStartCols] = useState<number[][] | null>(null);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setLayout(savedLayout);
    setCols(toColumns(items, LAYOUTS[savedLayout].count));
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const total = cols.reduce((n, c) => n + c.length, 0);

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

  const findColumn = (id: unknown, from: number[][]) =>
    isColId(id) ? Number(id.slice(4)) : from.findIndex((c) => c.includes(Number(id)));

  function onDragStart() {
    setStartCols(cols);
  }

  // Moving over another column puts the widget in it straight away, so it can be placed between that column's widgets.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = Number(active.id);
    setCols((prev) => {
      const from = findColumn(active.id, prev);
      const to = findColumn(over.id, prev);
      if (from < 0 || to < 0 || from === to) return prev;
      const target = prev[to];
      let index = target.length;
      if (!isColId(over.id)) {
        const overIndex = target.indexOf(Number(over.id));
        const translated = active.rect.current.translated;
        const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false;
        index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      }
      return prev.map((c, i) =>
        i === from ? c.filter((id) => id !== activeId) : i === to ? [...c.slice(0, index), activeId, ...c.slice(index)] : c,
      );
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const before = startCols ?? cols;
    setStartCols(null);
    const activeId = Number(active.id);
    let next = cols;
    if (over) {
      const col = findColumn(active.id, cols);
      if (col >= 0 && !isColId(over.id)) {
        const from = cols[col].indexOf(activeId);
        const to = cols[col].indexOf(Number(over.id));
        if (from >= 0 && to >= 0 && from !== to) next = cols.map((c, i) => (i === col ? arrayMove(c, from, to) : c));
      }
    }
    setCols(next);
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    act(() => saveLayout(layout, next), undefined, () => setCols(before));
  }

  function changeLayout(next: Layout) {
    const count = LAYOUTS[next].count;
    const before = { layout, cols };
    // Widgets from columns that no longer exist go to the bottom of the last one.
    const kept = cols.slice(0, count);
    const moved = cols.slice(count).flat();
    const nextCols = Array.from({ length: count }, (_, i) => kept[i] ?? []);
    nextCols[count - 1] = [...nextCols[count - 1], ...moved];
    setLayout(next);
    setCols(nextCols);
    act(
      () => saveLayout(next, nextCols),
      undefined,
      () => {
        setLayout(before.layout);
        setCols(before.cols);
      },
    );
  }

  const configuringItem = configuring === null ? null : (byId.get(configuring) ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <h1 className="sr-only">Dashboard</h1>
        {editing && (
          <>
            <label className="flex items-center gap-2 text-sm text-muted">
              Layout
              <select
                className="input py-1 text-foreground"
                value={layout}
                disabled={pending}
                onChange={(e) => changeLayout(e.target.value as Layout)}
              >
                {LAYOUT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {LAYOUTS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn" onClick={() => setAdding(true)}>
              + Add widget
            </button>
            <button
              className="btn"
              disabled={pending}
              onClick={() => {
                if (window.confirm("Replace your widgets with the default layout for your role?")) act(() => resetDashboard());
              }}
            >
              Reset to default
            </button>
          </>
        )}
        <button className={editing ? "btn btn-primary" : "btn"} onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Customize"}
        </button>
      </div>

      {error && (
        <p role="alert" className="card flex items-center justify-between gap-3 border-red-500/50 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
          <button className="underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}

      {total === 0 ? (
        <div className="card space-y-3 p-8 text-center">
          <p className="font-medium">Your dashboard is empty.</p>
          <p className="text-sm text-muted">Add the reports and lists you want to see here.</p>
          <button
            className="btn btn-primary mx-auto"
            onClick={() => {
              setEditing(true);
              setAdding(true);
            }}
          >
            + Add widget
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
          <div className={`grid grid-cols-1 items-start gap-4 ${LAYOUTS[layout].class}`}>
            {cols.map((ids, i) => (
              <Column
                key={i}
                index={i}
                ids={ids}
                byId={byId}
                editing={editing}
                busy={pending}
                onConfigure={setConfiguring}
                onRemove={(id) => act(() => removeWidget(id))}
              />
            ))}
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
            onSubmit={(config, title) => act(() => updateWidget(configuringItem.id, { config, title }), () => setConfiguring(null))}
          />
        </Modal>
      )}

      {adding && (
        <AddWidget
          role={role}
          lookups={lookups}
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(type, config, title) => act(() => addWidget({ type, config, title }), () => setAdding(false))}
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
        <p className="-mt-2 text-sm text-muted">{picked.preset.description}</p>
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
                    className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-border/30"
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
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
