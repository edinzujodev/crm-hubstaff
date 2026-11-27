"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { removeMyPhoto, setMyPhoto } from "@/app/actions";
import { Avatar, setPhotoVersion } from "@/components/avatar";
import { useConfirm } from "@/components/confirm-modal";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import { notify } from "@/lib/toast";

/** Photos are stored as a 512×512 JPEG: sharp on a high-density screen at the largest size they are shown (the profile). */
const SIDE = 512;
// At 1× the circle exactly fits the photo's shorter side; it never gets bigger than the photo.
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** A square in the photo, in its own pixels. */
type Area = { x: number; y: number; width: number; height: number };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

/** What is inside the circle, shrunk to SIDE×SIDE, as a JPEG. */
async function croppedJpeg(src: string, area: Area): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIDE, SIDE);
  ctx.imageSmoothingQuality = "high";
  const scale = SIDE / area.width;
  ctx.drawImage(img, -area.x * scale, -area.y * scale, img.naturalWidth * scale, img.naturalHeight * scale);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

/** The picked photo itself, shrunk to at most ORIGINAL_SIDE on its longer side, as a JPEG: kept to place it again. */
const ORIGINAL_SIDE = 1280;

async function originalJpeg(src: string): Promise<{ blob: Blob; scale: number }> {
  const img = await loadImage(src);
  const scale = Math.min(1, ORIGINAL_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85),
  );
  return { blob, scale };
}

/**
 * Place the circle over the photo, then save what is in it. The photo stays still and the circle follows the pointer
 * (or the arrow keys); zooming in makes the circle smaller. The circle always stays inside the photo, so the saved
 * photo is exactly what is in the circle. Positions are kept in the photo's own pixels, so what is on screen and what
 * is saved always match.
 */
function CropPhoto({
  src,
  initialArea,
  onSave,
  onReplace,
  onCancel,
}: {
  src: string;
  /** Where the circle was last time (in this photo's pixels), when placing the same photo again. */
  initialArea?: Area;
  onSave: (area: Area) => Promise<void>;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // The photo's own size, and the box it is shown in (layout size: not affected by the popup's opening animation).
  const [photo, setPhoto] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  // The circle: its middle and diameter, in the photo's pixels.
  const [circle, setCircle] = useState<{ x: number; y: number; d: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(src).then((img) => {
      if (!alive) return;
      const w = img.naturalWidth, h = img.naturalHeight;
      setPhoto({ w, h });
      const side = Math.min(w, h);
      const a = initialArea;
      setCircle(
        a && a.width > 0
          ? fit({ x: a.x + a.width / 2, y: a.y + a.height / 2, d: Math.min(a.width, side) }, w, h)
          : { x: w / 2, y: h / 2, d: side },
      );
    });
    return () => {
      alive = false;
    };
  }, [src, initialArea]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setFrame({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Screen pixels per photo pixel, and where the photo sits in the box.
  const scale = photo && frame ? Math.min(frame.w / photo.w, frame.h / photo.h) : 0;
  const left = photo && frame ? (frame.w - photo.w * scale) / 2 : 0;
  const top = photo && frame ? (frame.h - photo.h * scale) / 2 : 0;
  const side = photo ? Math.min(photo.w, photo.h) : 1;
  const zoom = circle ? side / circle.d : 1;

  const setZoom = useCallback(
    (z: number) => {
      if (!photo) return;
      const d = side / Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
      setCircle((c) => (c ? fit({ ...c, d }, photo.w, photo.h) : c));
    },
    [photo, side],
  );

  // The mouse wheel zooms (a listener of our own, so the page doesn't scroll at the same time).
  useEffect(() => {
    const el = box.current;
    if (!el || !photo) return;
    const smallest = side / MAX_ZOOM;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Scrolling up zooms in: a smaller circle.
      setCircle((c) => (c ? fit({ ...c, d: Math.max(smallest, c.d * Math.exp(e.deltaY / 500)) }, photo.w, photo.h) : c));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [photo, side]);

  const move = (dx: number, dy: number) => {
    if (!photo) return;
    setCircle((c) => (c ? fit({ ...c, x: c.x + dx, y: c.y + dy }, photo.w, photo.h) : c));
  };

  const ready = !!(photo && frame && circle && scale);
  return (
    <div className="space-y-4">
      <div
        ref={box}
        className="relative h-72 touch-none select-none overflow-hidden rounded-lg bg-zinc-900 sm:h-80"
        onPointerDown={(e) => {
          if (!circle || e.button !== 0) return;
          // Keep following the pointer even when it leaves the box; not every pointer can be captured.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: circle.x, cy: circle.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId || !photo || !scale) return;
          // The circle moves exactly as far as the pointer.
          setCircle((c) =>
            c ? fit({ ...c, x: d.cx + (e.clientX - d.x) / scale, y: d.cy + (e.clientY - d.y) / scale }, photo.w, photo.h) : c,
          );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {ready && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local file being placed, not a page image */}
            <img
              src={src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{ left, top, width: photo!.w * scale, height: photo!.h * scale }}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Circle position: drag, or use the arrow keys"
              aria-valuemin={0}
              aria-valuemax={photo!.w}
              aria-valuenow={Math.round(circle!.x)}
              aria-valuetext={`${Math.round(circle!.x)}, ${Math.round(circle!.y)}`}
              onKeyDown={(e) => {
                const step = (e.shiftKey ? 40 : 8) / scale;
                const keys: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                if (!keys[e.key]) return;
                e.preventDefault();
                move(...keys[e.key]!);
              }}
              className="absolute cursor-move rounded-full border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] outline-none focus-visible:border-sky-400"
              style={{
                left: left + (circle!.x - circle!.d / 2) * scale,
                top: top + (circle!.y - circle!.d / 2) * scale,
                width: circle!.d * scale,
                height: circle!.d * scale,
              }}
            />
          </>
        )}
      </div>
      <label className="flex items-center gap-3 text-xs text-muted">
        <i className="pi pi-minus text-[10px]" aria-hidden />
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="h-1.5 flex-1 cursor-pointer accent-(--primary)"
        />
        <i className="pi pi-plus text-[10px]" aria-hidden />
      </label>
      <p className="text-xs text-muted">Drag the circle over your face. Zoom with the slider or the mouse wheel.</p>
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" severity="secondary" text icon="pi pi-upload" label="Replace photo" onClick={onReplace} disabled={saving} />
        <Button type="button" severity="secondary" outlined onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!circle || saving}
          onClick={async () => {
            if (!circle) return;
            setSaving(true);
            try {
              await onSave({ x: circle.x - circle.d / 2, y: circle.y - circle.d / 2, width: circle.d, height: circle.d });
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/** Keeps the whole circle inside the photo. */
function fit(c: { x: number; y: number; d: number }, w: number, h: number) {
  const d = Math.min(c.d, w, h);
  const r = d / 2;
  return { d, x: Math.min(w - r, Math.max(r, c.x)), y: Math.min(h - r, Math.max(r, c.y)) };
}

/** The photo in the popup: a newly picked file, or the one already saved (to place it again). */
type Placing = { src: string; fresh: boolean; area?: Area };

/**
 * Your photo, big, at the top of the profile (initials until you add one). Clicking it opens a small menu: edit the
 * photo (place it in the circle again, or replace it with another one) or delete it; without one, upload one.
 */
export function ProfilePhoto({ userId, name, hasPhoto }: { userId: number; name: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [has, setHas] = useState(hasPhoto);
  // The photo in the popup while it is open.
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [ask, confirmModal] = useConfirm();

  // The photo's temporary URL is let go once it is replaced or the popup closes.
  const src = placing?.src;
  useEffect(() => {
    if (!src) return;
    return () => URL.revokeObjectURL(src);
  }, [src]);

  // The menu closes on a click elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const closeCrop = useCallback(() => setPlacing(null), []);

  /** A file picked to upload, or to replace the photo in the popup. */
  async function pick(file: File) {
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
    } catch {
      URL.revokeObjectURL(url);
      notify({ message: "Couldn't read that photo", detail: "Try a JPG or PNG.", tone: "error" });
      return;
    }
    setPlacing({ src: url, fresh: true });
  }

  /** The saved photo, to place it in the circle again where it was. */
  async function edit() {
    setMenu(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/avatar/${userId}/original`, { cache: "no-store" });
      if (!res.ok) throw new Error("load");
      const header = res.headers.get("X-Photo-Crop");
      const area = header ? (JSON.parse(header) as Area) : undefined;
      // A photo saved before originals were kept comes without a place: it becomes the original from now on.
      setPlacing({ src: URL.createObjectURL(await res.blob()), fresh: !area, area });
    } catch {
      notify({ message: "Couldn't open your photo", detail: "Try again, or upload it again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function save(area: Area) {
    if (!placing) return;
    const data = new FormData();
    try {
      data.set("photo", new File([await croppedJpeg(placing.src, area)], "photo.jpg", { type: "image/jpeg" }));
      if (placing.fresh) {
        // The original is kept shrunk, so the square is kept in the shrunk photo's pixels.
        const { blob, scale } = await originalJpeg(placing.src);
        data.set("original", new File([blob], "original.jpg", { type: "image/jpeg" }));
        data.set("crop", JSON.stringify({ x: area.x * scale, y: area.y * scale, width: area.width * scale, height: area.height * scale }));
      } else {
        data.set("keepOriginal", "1");
        data.set("crop", JSON.stringify(area));
      }
    } catch {
      notify({ message: "Couldn't read that photo", detail: "Try a JPG or PNG.", tone: "error" });
      return;
    }
    const r = await setMyPhoto(data);
    if (!r.ok) {
      notify({ message: "Couldn't save the photo", detail: r.error, tone: "error" });
      return;
    }
    setPhotoVersion(userId, r.data.version);
    setHas(true);
    setPlacing(null);
    notify({ message: "Photo saved" });
  }

  async function remove() {
    setMenu(false);
    const sure = await ask({
      title: "Delete your photo?",
      message: "Your initials show instead.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!sure) return;
    setBusy(true);
    const r = await removeMyPhoto();
    setBusy(false);
    if (!r.ok) {
      notify({ message: "Couldn't delete the photo", detail: r.error, tone: "error" });
      return;
    }
    setPhotoVersion(userId, null);
    setHas(false);
    notify({ message: "Photo deleted" });
  }

  const item = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-foreground/5 disabled:opacity-50";

  return (
    <div ref={root} className="relative w-24 shrink-0 md:w-full">
      <button
        type="button"
        disabled={busy}
        onClick={() => setMenu((m) => !m)}
        aria-haspopup="menu"
        aria-expanded={menu}
        aria-label={has ? "Edit or delete your photo" : "Add a photo"}
        title={has ? "Edit or delete your photo" : "Add a photo"}
        className="group relative block w-full cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Avatar name={name} userId={userId} size="hero" solid />
        <span className="absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/10" aria-hidden />
        <span
          className="absolute bottom-[6%] right-[6%] flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm md:h-9 md:w-9"
          aria-hidden
        >
          <i className="pi pi-camera text-sm" />
        </span>
      </button>

      {menu && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-2 w-48 rounded-lg border border-border bg-surface p-1 shadow-lg md:left-auto md:right-0">
          {has ? (
            <>
              <button type="button" role="menuitem" className={item} onClick={edit}>
                <i className="pi pi-pencil text-xs text-muted" aria-hidden />
                Edit photo
              </button>
              <button type="button" role="menuitem" className={`${item} text-red-600 dark:text-red-400`} onClick={remove}>
                <i className="pi pi-trash text-xs" aria-hidden />
                Delete photo
              </button>
            </>
          ) : (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setMenu(false);
                input.current?.click();
              }}
            >
              <i className="pi pi-upload text-xs text-muted" aria-hidden />
              Upload a photo
            </button>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
      {placing && (
        <Modal title={has ? "Edit photo" : "Place your photo"} onClose={closeCrop}>
          {/* Another photo starts afresh: the cropper is made again for it. */}
          <CropPhoto
            key={placing.src}
            src={placing.src}
            initialArea={placing.area}
            onSave={save}
            onReplace={() => input.current?.click()}
            onCancel={closeCrop}
          />
        </Modal>
      )}
      {confirmModal}
    </div>
  );
}
