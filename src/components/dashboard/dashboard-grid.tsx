"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "@/components/modal";
import { WidgetForm, type Lookups } from "@/components/dashboard/widget-form";
import type { Role } from "@/lib/auth";
import {
  SIZES,
  SIZE_CLASS,
  SIZE_LABEL,
  WIDGETS,
  presetsFor,
  widgetsFor,
  type AnyConfig,
  type Preset,
  type Size,
  type WidgetType,
} from "@/lib/dashboard/config";
import { addWidget, removeWidget, resetDashboard, resizeWidget, saveOrder, updateWidget } from "@/app/dashboard/actions";

export type GridItem = {
  id: number;
  type: WidgetType;
  size: Size;
  /** The heading shown: the custom title, or one built from the settings. */
  title: string;
  customTitle: string | null;
  config: AnyConfig;
  /** The widget's content, rendered on the server. */
  body: ReactNode;
};

type Result = { ok: true } | { ok: false; error: string };

function Frame({
  item,
  size,
  editing,
  busy,
  onConfigure,
  onResize,
  onRemove,
}: {
  item: GridItem;
  size: Size;
  editing: boolean;
  busy: boolean;
  onConfigure: () => void;
  onResize: (s: Size) => void;
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
      className={`card @container relative min-w-0 p-4 ${SIZE_CLASS[size]} ${editing ? "outline-1 outline-dashed outline-border" : ""} ${isDragging ? "z-10" : ""}`}
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
            <div className="flex overflow-hidden rounded-md border border-border text-xs" role="group" aria-label="Width">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onResize(s)}
                  disabled={busy}
                  aria-pressed={s === size}
                  title={SIZE_LABEL[s]}
                  className={`px-1.5 py-1 ${s === size ? "bg-primary text-(--primary-fg)" : "hover:bg-border/40"}`}
                >
                  {s === "full" ? "XL" : s.toUpperCase()}
                </button>
              ))}
            </div>
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

export function DashboardGrid({
  items,
  role,
  lookups,
}: {
  items: GridItem[];
  role: Role;
  lookups: Lookups;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [configuring, setConfiguring] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  // Local order and sizes make drags and resizes feel instant; the server's list wins whenever it changes.
  const serverKey = items.map((i) => i.id).join(",");
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  const [seen, setSeen] = useState(serverKey);
  if (seen !== serverKey) {
    setSeen(serverKey);
    setOrder(items.map((i) => i.id));
    setSizes({});
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = order.map((id) => byId.get(id)).filter((i): i is GridItem => !!i);

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

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(Number(e.active.id));
    const to = order.indexOf(Number(e.over.id));
    if (from < 0 || to < 0) return;
    const before = order;
    const next = arrayMove(order, from, to);
    setOrder(next);
    act(() => saveOrder(next), undefined, () => setOrder(before));
  }

  function resize(id: number, size: Size) {
    const before = sizes[id];
    setSizes((s) => ({ ...s, [id]: size }));
    act(
      () => resizeWidget(id, size),
      undefined,
      () => setSizes((s) => ({ ...s, [id]: before ?? items.find((i) => i.id === id)!.size })),
    );
  }

  const configuringItem = configuring === null ? null : (byId.get(configuring) ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">Dashboard</h1>
        {editing && (
          <>
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

      {ordered.length === 0 ? (
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-12">
              {ordered.map((item) => (
                <Frame
                  key={item.id}
                  item={item}
                  size={sizes[item.id] ?? item.size}
                  editing={editing}
                  busy={pending}
                  onConfigure={() => setConfiguring(item.id)}
                  onResize={(s) => resize(item.id, s)}
                  onRemove={() => act(() => removeWidget(item.id))}
                />
              ))}
            </div>
          </SortableContext>
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
          onAdd={(type, config, title, size) => act(() => addWidget({ type, config, title, size }), () => setAdding(false))}
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
  onAdd: (type: WidgetType, config: AnyConfig, title: string | null, size: Size) => void;
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
          onSubmit={(config, title) => onAdd(picked.type, config, title, WIDGETS[picked.type].defaultSize)}
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
