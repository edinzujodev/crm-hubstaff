"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area, type CropperProps } from "react-easy-crop";
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

type Point = { x: number; y: number };
type MediaSize = Parameters<NonNullable<CropperProps["onMediaLoaded"]>>[0];

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

/**
 * Move the circle over the picked photo and zoom, then save what is in the circle. The cropper itself moves the photo
 * under a fixed circle; here a drag is turned around, so the circle follows the pointer instead. The circle may go
 * up to the photo's edges but never past them, so the saved photo is exactly what is in the circle.
 */
function CropPhoto({ src, onSave, onCancel }: { src: string; onSave: (area: Area) => Promise<void>; onCancel: () => void }) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const media = useRef<MediaSize | null>(null);
  // The circle's diameter on screen.
  const circle = useRef(0);
  // Where the photo was when the drag started (null: not dragging).
  const dragStart = useRef<Point | null>(null);
  const drags = useRef(0);
  // The cropper measures the photo once, when it appears. The popup opens with a zoom-in animation, so it only
  // appears once the popup has its full size; measured mid-animation, the saved area would not match the circle.
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let frame = 0;
    const started = performance.now();
    const check = () => {
      const el = box.current;
      const settled = el && Math.abs(el.getBoundingClientRect().width - el.offsetWidth) < 0.5;
      if (settled || performance.now() - started > 1500) setReady(true);
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, []);

  const clamp = useCallback(
    (p: Point, z = zoom): Point => {
      if (!media.current) return p;
      // How far the photo may move before an edge of it would come inside the circle.
      const maxX = Math.max(0, (media.current.width * z - circle.current) / 2);
      const maxY = Math.max(0, (media.current.height * z - circle.current) / 2);
      return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) };
    },
    [zoom],
  );

  const onCropChange = useCallback(
    (next: Point) => {
      const start = dragStart.current;
      // The cropper moves the photo with the pointer; the opposite way moves the circle with it.
      setCrop(clamp(start ? { x: 2 * start.x - next.x, y: 2 * start.y - next.y } : next));
    },
    [clamp],
  );
  // Reported after every change of position or zoom, from what is on screen (the "complete" report at the end of a
  // drag can come before the turned-around position is applied).
  const onCropAreaChange = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  return (
    <div className="space-y-4">
      <div ref={box} className="relative h-72 overflow-hidden rounded-lg bg-zinc-900 sm:h-80">
        {ready && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            aspect={1}
            cropShape="round"
            showGrid={false}
            restrictPosition={false}
            onMediaLoaded={(m) => (media.current = m)}
            onCropSizeChange={(s) => (circle.current = s.width)}
            onInteractionStart={({ source }) => {
              if (source === "mouse" || source === "touch") {
                drags.current++;
                dragStart.current = crop;
              }
            }}
            onInteractionEnd={() => {
              // The cropper may still send the drag's last move in the next frame: keep turning it around until then.
              const drag = drags.current;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  if (drags.current === drag) dragStart.current = null;
                }),
              );
            }}
            onCropChange={onCropChange}
            onZoomChange={(z) => {
              setZoom(z);
              setCrop((c) => clamp(c, z));
            }}
            onCropAreaChange={onCropAreaChange}
          />
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
          onChange={(e) => {
            const z = Number(e.target.value);
            setZoom(z);
            setCrop((c) => clamp(c, z));
          }}
          aria-label="Zoom"
          className="h-1.5 flex-1 cursor-pointer accent-(--primary)"
        />
        <i className="pi pi-plus text-[10px]" aria-hidden />
      </label>
      <p className="text-xs text-muted">Drag the circle over your face. Zoom with the slider or the mouse wheel.</p>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" severity="secondary" outlined onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!area || saving}
          onClick={async () => {
            if (!area) return;
            setSaving(true);
            try {
              await onSave(area);
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

/**
 * Your photo, big, at the top of the profile (initials until you add one). Clicking it opens a small menu: add or
 * change the photo (placed in the circle in a popup next), or remove it.
 */
export function ProfilePhoto({ userId, name, hasPhoto }: { userId: number; name: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [has, setHas] = useState(hasPhoto);
  // The picked file, shown in the crop popup while it is open.
  const [picked, setPicked] = useState<string | null>(null);
  const [ask, confirmModal] = useConfirm();

  // The picked file's temporary URL is let go once the popup closes.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked);
  }, [picked]);

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

  const closeCrop = useCallback(() => setPicked(null), []);

  async function pick(file: File) {
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
    } catch {
      URL.revokeObjectURL(url);
      notify({ message: "Couldn't read that photo", detail: "Try a JPG or PNG.", tone: "error" });
      return;
    }
    setPicked(url);
  }

  async function save(area: Area) {
    if (!picked) return;
    let blob: Blob;
    try {
      blob = await croppedJpeg(picked, area);
    } catch {
      notify({ message: "Couldn't read that photo", detail: "Try a JPG or PNG.", tone: "error" });
      return;
    }
    const data = new FormData();
    data.set("photo", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    const r = await setMyPhoto(data);
    if (!r.ok) {
      notify({ message: "Couldn't save the photo", detail: r.error, tone: "error" });
      return;
    }
    setPhotoVersion(userId, r.data.version);
    setHas(true);
    setPicked(null);
    notify({ message: "Photo saved" });
  }

  async function remove() {
    setMenu(false);
    const sure = await ask({
      title: "Remove your photo?",
      message: "Your initials show instead.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!sure) return;
    setBusy(true);
    const r = await removeMyPhoto();
    setBusy(false);
    if (!r.ok) {
      notify({ message: "Couldn't remove the photo", detail: r.error, tone: "error" });
      return;
    }
    setPhotoVersion(userId, null);
    setHas(false);
    notify({ message: "Photo removed" });
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
        aria-label={has ? "Change or remove your photo" : "Add a photo"}
        title={has ? "Change or remove your photo" : "Add a photo"}
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
            {has ? "Change photo" : "Upload a photo"}
          </button>
          {has && (
            <button type="button" role="menuitem" className={`${item} text-red-600 dark:text-red-400`} onClick={remove}>
              <i className="pi pi-trash text-xs" aria-hidden />
              Remove photo
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
      {picked && (
        <Modal title="Place your photo" onClose={closeCrop}>
          <CropPhoto src={picked} onSave={save} onCancel={closeCrop} />
        </Modal>
      )}
      {confirmModal}
    </div>
  );
}
