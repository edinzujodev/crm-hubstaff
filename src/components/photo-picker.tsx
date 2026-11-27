"use client";

import { useRef, useState } from "react";
import { removeMyPhoto, setMyPhoto } from "@/app/actions";
import { Avatar, setPhotoVersion } from "@/components/avatar";
import { useConfirm } from "@/components/confirm-modal";
import { Button } from "@/components/ui";
import { notify } from "@/lib/toast";

/** Photos are stored as a 256×256 JPEG: sharp on a high-density screen at the largest size they are shown. */
const SIDE = 256;

/** The middle square of the picked image, shrunk to SIDE×SIDE, as a JPEG. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: a transparent PNG gets a white background instead of black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIDE, SIDE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85));
}

/** Your photo on the profile: upload a new one or remove it (your initials show instead). */
export function PhotoPicker({ userId, name, hasPhoto }: { userId: number; name: string; hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [has, setHas] = useState(hasPhoto);
  const [ask, confirmModal] = useConfirm();

  async function upload(file: File) {
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await squareJpeg(file);
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
      notify({ message: "Photo saved" });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
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

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} userId={userId} size="2xl" solid />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="small" icon="pi pi-camera" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Saving…" : has ? "Change photo" : "Upload photo"}
          </Button>
          {has && (
            <Button type="button" size="small" severity="secondary" outlined disabled={busy} onClick={remove}>
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">A JPG or PNG. The middle square is used, so put your face in the centre.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {confirmModal}
    </div>
  );
}
