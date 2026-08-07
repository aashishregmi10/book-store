"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, Trash2, UploadCloud, Plus } from "lucide-react";
import { clientApi, ClientApiError } from "@/lib/client-api";
import type { BookImage } from "./types";

// Uploads one file to Cloudinary via the API and returns the image subdocument.
async function uploadFile(file: File): Promise<BookImage> {
  const form = new FormData();
  form.append("image", file);
  return clientApi.upload<BookImage>("/upload?folder=books", form);
}

function isImage(file: File) {
  return file.type.startsWith("image/");
}

/** Single primary cover (the required `coverImage` subdocument). */
export function ImageUpload({
  value,
  onChange,
}: {
  value: BookImage | null;
  onChange: (img: BookImage | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!isImage(file)) {
      setError("That doesn't look like an image file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Upload failed, please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <span className="font-data text-xs uppercase tracking-wide text-muted">Cover image</span>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="mt-1 flex items-start gap-4">
        <div className="relative h-40 w-28 shrink-0 overflow-hidden border border-border bg-bg">
          {value ? (
            <Image src={value.secureUrl} alt="Cover preview" width={112} height={160} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted">
              <ImagePlus className="size-7" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex h-40 flex-1 flex-col items-center justify-center gap-2 border border-dashed px-4 text-center transition-colors ${
            dragging ? "border-accent bg-accent/5" : "border-border bg-bg hover:border-accent"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="size-6 animate-spin text-accent" />
              <span className="font-body text-sm text-muted">Uploading to Cloudinary…</span>
            </>
          ) : (
            <>
              <UploadCloud className="size-6 text-accent" />
              <span className="font-body text-sm text-text">Click to choose a file, or drag an image here</span>
              <span className="font-data text-xs text-muted">JPEG, PNG, WebP or AVIF · up to 5MB</span>
            </>
          )}
        </button>
      </div>

      {value && !uploading && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-2 inline-flex items-center gap-1.5 font-data text-xs uppercase tracking-wide text-muted hover:text-sale"
        >
          <Trash2 className="size-3.5" /> Remove image
        </button>
      )}

      {error && <p className="mt-2 font-body text-sm text-sale">{error}</p>}
    </div>
  );
}

/** Gallery of additional images (the `images[]` array), bounded by min/max. */
export function GalleryUpload({
  value,
  onChange,
  min = 0,
  max = 6,
}: {
  value: BookImage[];
  onChange: (imgs: BookImage[]) => void;
  min?: number;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const remaining = max - value.length;
  const belowMin = value.length < min;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).filter(isImage).slice(0, Math.max(0, remaining));
    if (picked.length === 0) {
      setError(remaining <= 0 ? `You can add at most ${max} images.` : "Those didn't look like image files.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const uploaded = await Promise.all(picked.map(uploadFile));
      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof ClientApiError ? err.message : "Upload failed, please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-data text-xs uppercase tracking-wide text-muted">Gallery images</span>
        <span className={`font-data text-xs ${belowMin ? "text-sale" : "text-muted"}`}>
          {value.length}/{max}
          {min > 0 && ` · min ${min}`}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="mt-2 flex flex-wrap gap-3">
        {value.map((img, i) => (
          <div key={img.publicId || i} className="group relative h-28 w-20 overflow-hidden border border-border bg-bg">
            <Image src={img.secureUrl} alt={img.name || "Gallery image"} width={80} height={112} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeAt(i)}
              aria-label="Remove image"
              className="absolute right-1 top-1 grid size-6 place-items-center bg-text/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => !uploading && inputRef.current?.click()}
            disabled={uploading}
            className="flex h-28 w-20 flex-col items-center justify-center gap-1 border border-dashed border-border bg-bg text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-5 animate-spin text-accent" /> : <Plus className="size-5" />}
            <span className="font-data text-[10px] uppercase tracking-wide">Add</span>
          </button>
        )}
      </div>

      {error && <p className="mt-2 font-body text-sm text-sale">{error}</p>}
    </div>
  );
}
