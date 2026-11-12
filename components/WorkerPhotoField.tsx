"use client";

import { useRef, useState } from "react";
import { Camera, IdCard, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PhotoFieldProps {
  id: string;
  label: string;
  hint?: string;
  kind: "ktp" | "selfie";
  file: File | null;
  onChange: (file: File | null) => void;
  required?: boolean;
  /** Foto sudah tersimpan di server (tidak ditampilkan di form publik). */
  hasExisting?: boolean;
}

export function WorkerPhotoField({
  id,
  label,
  hint,
  kind,
  file,
  onChange,
  required,
  hasExisting,
}: PhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const displayUrl = preview;

  function handleFile(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (f) {
      setPreview(URL.createObjectURL(f));
      onChange(f);
    } else {
      setPreview(null);
      onChange(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const Icon = kind === "ktp" ? IdCard : Camera;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {hint && <p className="mb-2 text-xs text-slate-400">{hint}</p>}

      {displayUrl ? (
        <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={label}
            className="mx-auto max-h-48 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => handleFile(null)}
            className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-600 shadow hover:bg-white hover:text-red-600"
            aria-label="Hapus foto"
          >
            <X className="h-4 w-4" />
          </button>
          <label
            htmlFor={id}
            className="absolute bottom-2 left-2 cursor-pointer rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow hover:bg-white"
          >
            Ganti
          </label>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-slate-400 hover:bg-slate-100"
          )}
        >
          <Icon className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {hasExisting ? "Foto sudah tersimpan · ketuk untuk ganti" : "Pilih / ambil foto"}
          </span>
          <span className="text-xs text-slate-400">JPG, PNG, WebP · max 12MB</span>
        </label>
      )}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        capture={kind === "selfie" ? "user" : "environment"}
        className="sr-only"
        required={required && !file && !hasExisting}
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          handleFile(f);
        }}
      />
    </div>
  );
}
