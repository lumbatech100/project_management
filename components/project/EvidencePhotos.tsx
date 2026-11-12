"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  urls: string[];
  canEdit?: boolean;
  uploading?: boolean;
  onUpload?: (file: File) => Promise<void> | void;
  onRemove?: (url: string) => Promise<void> | void;
  label?: string;
  className?: string;
};

export function EvidencePhotos({
  urls,
  canEdit = false,
  uploading = false,
  onUpload,
  onRemove,
  label,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      await onUpload(file);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(url: string) {
    if (!onRemove) return;
    setBusy(true);
    try {
      await onRemove(url);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || uploading;

  if (!canEdit && urls.length === 0) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((url) => (
          <div key={url} className="relative h-14 w-14 shrink-0">
            <button
              type="button"
              onClick={() => setPreview(url)}
              className="h-full w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
              title="Lihat foto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Bukti"
                className="h-full w-full object-cover"
              />
            </button>
            {canEdit && onRemove && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemove(url)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-brand p-0.5 text-white shadow disabled:opacity-50"
                title="Hapus foto"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {canEdit && onUpload && urls.length < 5 && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-300 bg-white text-slate-500 hover:border-slate-500 hover:text-slate-800 disabled:opacity-50"
              title="Upload foto"
            >
              <Camera className="h-4 w-4" />
              <span className="text-[9px] font-medium">
                {disabled ? "..." : "Foto"}
              </span>
            </button>
          </>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-900"
            onClick={() => setPreview(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview bukti"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
