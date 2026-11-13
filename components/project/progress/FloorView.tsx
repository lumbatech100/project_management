"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Upload,
  MapPin,
  Check,
  Trash2,
  Pencil,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Send,
  ScanSearch,
  Crop,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EvidencePhotos } from "@/components/project/EvidencePhotos";
import { FloorMap } from "@/components/project/progress/FloorMap";
import {
  MIN_REGION_SIZE,
  pointInRegion,
  type PlotRegion,
} from "@/lib/plot-region";
import { calcFloorProgress, calcMarkerProgress, cn } from "@/lib/utils";
import { shrinkImageForUpload, uploadWithProgress } from "@/lib/client-image";
import {
  DOOR_PROFILES,
  profileAllowsKeyswitch,
  profileLabel,
  type DoorProfileCode,
} from "@/lib/door-profiles";
import { PROGRESS_STEPS, type ProgressStep } from "@/lib/progress-steps";
import {
  COLOR_FAMILY_SWATCH,
  PLOT_COLOR_CHOICES,
  colorFamilyFromHex,
  countMarkersByColor,
} from "@/lib/marker-color";

interface BreakdownItem {
  id: string;
  name: string;
  bobot: number;
  status?: "OPEN" | "SUBMITTED" | "APPROVED";
  done: boolean;
  progressPct?: number;
  submittedPct?: number | null;
  doneAt?: string | Date | null;
  doneBy?: string | null;
  submittedAt?: string | Date | null;
  submittedBy?: string | null;
  approvedAt?: string | Date | null;
  approvedBy?: string | null;
  photoUrls?: string[];
}

interface Marker {
  id: string;
  label: string;
  x: number;
  y: number;
  profileCode?: string | null;
  hasKeyswitch?: boolean;
  color?: string | null;
  items: BreakdownItem[];
}

interface Floor {
  id: string;
  name: string;
  drawingUrl?: string | null;
  drawingHiUrl?: string | null;
  /** Area denah untuk deteksi titik (0–1); null = seluruh gambar */
  plotRegion?: PlotRegion | null;
  markers: Marker[];
}

interface FloorViewProps {
  projectId: string;
  floors: Floor[];
  canManage: boolean;
  /** Admin: tambah/edit/hapus breakdown & profil titik */
  canEditBreakdown?: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  pendingMarkerIds?: string[];
  initialMarkerId?: string | null;
  /** Halaman asal (mis. Pending Approval) — dituju balik setelah diputuskan */
  returnTo?: string | null;
}

function itemStatus(item: BreakdownItem): "OPEN" | "SUBMITTED" | "APPROVED" {
  if (item.status) return item.status;
  return item.done ? "APPROVED" : "OPEN";
}

const DRAWING_EXTS = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "pdf"];
const DRAWING_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.tif,.tiff,.pdf,image/jpeg,image/png,image/webp,image/tiff,application/pdf";
const DRAWING_MAX_BYTES = 100 * 1024 * 1024;

function drawingFileError(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "heic" || ext === "heif") {
    return "Format HEIC (foto iPhone) belum didukung. Ubah ke JPG dulu.";
  }
  if (!ext || !DRAWING_EXTS.includes(ext)) {
    return "Format drawing harus JPG, PNG, WEBP, TIFF, atau PDF";
  }
  if (file.size > DRAWING_MAX_BYTES) {
    return `Ukuran file ${(file.size / 1048576).toFixed(0)}MB — maksimal 100MB`;
  }
  return null;
}

function floorIdForMarker(floors: Floor[], markerId: string | null | undefined) {
  if (!markerId) return null;
  return floors.find((f) => f.markers.some((m) => m.id === markerId))?.id ?? null;
}

function PlotColorAssign({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">Warna plot</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium",
            !value
              ? "border-brand bg-brand text-white"
              : "border-slate-200 bg-white text-slate-600"
          )}
        >
          Tanpa warna
        </button>
        {PLOT_COLOR_CHOICES.map((c) => {
          const on = value === c.color;
          return (
            <button
              key={c.family}
              type="button"
              onClick={() => onChange(c.color)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                on
                  ? "border-brand bg-brand text-white"
                  : "border-slate-200 bg-white text-slate-600"
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full border border-white/50"
                style={{ backgroundColor: c.color }}
              />
              {c.family}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FloorView({
  projectId,
  floors: initialFloors,
  canManage,
  canEditBreakdown = false,
  canSubmit,
  canApprove,
  pendingMarkerIds = [],
  initialMarkerId = null,
  returnTo = null,
}: FloorViewProps) {
  const router = useRouter();
  const [floors, setFloors] = useState(initialFloors);
  const [pendingIds, setPendingIds] = useState(pendingMarkerIds);
  const [activeFloorId, setActiveFloorId] = useState(
    () =>
      floorIdForMarker(initialFloors, initialMarkerId) ||
      initialFloors[0]?.id ||
      ""
  );

  useEffect(() => {
    setPendingIds(pendingMarkerIds);
  }, [pendingMarkerIds]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(
    initialMarkerId
  );
  const [plotMode, setPlotMode] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  /** Leader: itemId → % yang dipilih untuk submit (25|50|75|100) */
  const [pendingPct, setPendingPct] = useState<Record<string, ProgressStep>>(
    {}
  );

  const [floorModal, setFloorModal] = useState(false);
  const [floorName, setFloorName] = useState("");
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [markerModal, setMarkerModal] = useState(false);
  const [markerLabel, setMarkerLabel] = useState("");
  const [markerProfile, setMarkerProfile] =
    useState<DoorProfileCode>("1D_CR_CR");
  const [markerKeyswitch, setMarkerKeyswitch] = useState(false);
  const [markerColor, setMarkerColor] = useState<string | null>(
    COLOR_FAMILY_SWATCH.Hijau
  );
  const [profileEditModal, setProfileEditModal] = useState(false);
  const [editMarkerLabel, setEditMarkerLabel] = useState("");
  const [editProfileCode, setEditProfileCode] =
    useState<DoorProfileCode>("1D_CR_CR");
  const [editHasKeyswitch, setEditHasKeyswitch] = useState(false);
  const [editMarkerColor, setEditMarkerColor] = useState<string | null>(null);
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toggleError, setToggleError] = useState("");

  // drawing: ganti / hapus (butuh password)
  const [drawingModal, setDrawingModal] = useState<
    null | "replace" | "delete"
  >(null);
  const [drawingPassword, setDrawingPassword] = useState("");
  const [pendingReplaceFile, setPendingReplaceFile] = useState<File | null>(
    null
  );
  const [drawingError, setDrawingError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");

  // area plot (fokus ke denah, abaikan legend/judul)
  const [regionEdit, setRegionEdit] = useState(false);
  const [regionDraft, setRegionDraft] = useState<PlotRegion | null>(null);
  const [regionSaving, setRegionSaving] = useState(false);

  const [detectOpen, setDetectOpen] = useState(false);
  const [detectLoading, setDetectLoading] = useState(false);
  const [detectApplying, setDetectApplying] = useState(false);
  const [detectError, setDetectError] = useState("");
  const [detectPoints, setDetectPoints] = useState<
    {
      id: string;
      x: number;
      y: number;
      color: string;
      family: string;
      area: number;
      markerId?: string | null;
    }[]
  >([]);
  const [detectDeleting, setDetectDeleting] = useState(false);
  const [detectSelected, setDetectSelected] = useState<Set<string>>(
    () => new Set()
  );
  const [detectPrefix, setDetectPrefix] = useState("Pintu");
  const [detectProfile, setDetectProfile] =
    useState<DoorProfileCode>("1D_CR_CR");
  const [detectKeyswitch, setDetectKeyswitch] = useState(false);
  const [detectSkipped, setDetectSkipped] = useState(0);

  // inline breakdown form per marker
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; bobot: string }>
  >({});
  const [editItem, setEditItem] = useState<BreakdownItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editBobot, setEditBobot] = useState("");
  const [editError, setEditError] = useState("");

  /** Laporan harian per titik (Leader submit → SM approve) */
  const [markerReport, setMarkerReport] = useState<{
    id: string;
    status: string;
    blocker: string | null;
    notes: string | null;
    blockerPhotos?: string[];
    submittedBy: string | null;
    submittedAt: string | null;
    reviewedBy: string | null;
    rejectReason: string | null;
  } | null>(null);
  const [dailyClosed, setDailyClosed] = useState(false);
  const [mrBlocker, setMrBlocker] = useState("");
  const [mrNotes, setMrNotes] = useState("");
  const [mrLoading, setMrLoading] = useState(false);
  const [mrActing, setMrActing] = useState(false);
  const [mrMsg, setMrMsg] = useState("");
  /** SM: itemId → terima/tolak. Baru dikunci saat Approve titik di bawah. */
  const [itemDecisions, setItemDecisions] = useState<
    Record<string, "accept" | "reject">
  >({});

  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const activeFloor = floors.find((f) => f.id === activeFloorId);

  // Checklist overlay: kunci scroll halaman (tinggi denah tidak ikut terscroll)
  useEffect(() => {
    const main = document.querySelector("main");
    if (!(main instanceof HTMLElement)) return;
    if (selectedMarkerId) {
      main.scrollTop = 0;
      main.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      main.style.overflow = "";
      document.body.style.overflow = "";
    }
    return () => {
      main.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [selectedMarkerId]);

  useEffect(() => {
    setItemDecisions({});
    if (!selectedMarkerId) {
      setMarkerReport(null);
      setMrBlocker("");
      setMrNotes("");
      setMrMsg("");
      return;
    }
    let cancelled = false;
    (async () => {
      setMrLoading(true);
      setMrMsg("");
      try {
        const res = await fetch(
          `/api/project/${projectId}/marker/${selectedMarkerId}/daily-report`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal muat laporan titik");
        if (cancelled) return;
        setDailyClosed(!!data.dailyReportClosed);
        const r = data.report;
        setMarkerReport(r);
        setMrBlocker(r?.blocker || "");
        setMrNotes(r?.notes || "");
      } catch (err) {
        if (!cancelled) {
          setMrMsg(err instanceof Error ? err.message : "Error");
          setMarkerReport(null);
        }
      } finally {
        if (!cancelled) setMrLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedMarkerId]);

  async function runMarkerReport(
    action: "save-draft" | "submit" | "approve" | "reject"
  ) {
    if (!selectedMarkerId) return;
    setMrActing(true);
    setMrMsg("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/marker/${selectedMarkerId}/daily-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            blocker: mrBlocker,
            notes: mrNotes,
            rejectReason:
              action === "reject"
                ? prompt("Alasan tolak (opsional):") || null
                : undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setMarkerReport(data.report);
      setMrBlocker(data.report.blocker || "");
      setMrNotes(data.report.notes || "");
      if (action === "submit") {
        setMrMsg("Laporan titik terkirim ke SM.");
        setPendingIds((prev) =>
          prev.includes(selectedMarkerId!) ? prev : [...prev, selectedMarkerId!]
        );
      }
      if (action === "approve") {
        setMrMsg("Laporan titik di-approve.");
        setPendingIds((prev) => prev.filter((id) => id !== selectedMarkerId));
        backToReturnPage();
      }
      if (action === "reject") {
        setMrMsg("Laporan titik ditolak.");
        setPendingIds((prev) => prev.filter((id) => id !== selectedMarkerId));
        backToReturnPage();
      }
      if (action === "save-draft") setMrMsg("Draft laporan titik tersimpan.");
    } catch (err) {
      setMrMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setMrActing(false);
    }
  }

  async function createFloor(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (editingFloorId) {
        const res = await fetch(
          `/api/project/${projectId}/floor/${editingFloorId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: floorName }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal rename");
        setFloors((prev) =>
          prev.map((f) => (f.id === editingFloorId ? { ...f, name: data.name } : f))
        );
      } else {
        const res = await fetch(`/api/project/${projectId}/floor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: floorName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal");
        setFloors((prev) => [...prev, { ...data, markers: [] }]);
        setActiveFloorId(data.id);
      }
      setFloorModal(false);
      setFloorName("");
      setEditingFloorId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function openAddFloor() {
    setEditingFloorId(null);
    setFloorName("");
    setError("");
    setFloorModal(true);
  }

  function openRenameFloor(floor: Floor) {
    setEditingFloorId(floor.id);
    setFloorName(floor.name);
    setError("");
    setFloorModal(true);
  }

  async function uploadDrawing(file: File, password?: string) {
    if (!activeFloorId) return;

    const invalid = drawingFileError(file);
    if (invalid) {
      alert(invalid);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setLoading(true);
    setDrawingError("");
    setUploadStatus("Menyiapkan...");
    try {
      const prepared = await shrinkImageForUpload(file);
      const form = new FormData();
      form.append("file", prepared);
      if (password) form.append("password", password);
      setUploadStatus("Uploading 0%");
      const res = await uploadWithProgress(
        `/api/project/${projectId}/floor/${activeFloorId}/upload`,
        form,
        (pct) =>
          setUploadStatus(pct >= 100 ? "Memproses..." : `Uploading ${pct}%`)
      );
      const data = res.data as {
        drawingUrl?: string;
        drawingHiUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 413 || res.status === 504 || res.status === 502
              ? "Upload terputus di server (file terlalu besar / koneksi lambat)"
              : `Upload gagal (HTTP ${res.status})`)
        );
      }
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                drawingUrl: data.drawingUrl,
                drawingHiUrl: data.drawingHiUrl ?? null,
              }
            : f
        )
      );
      setDrawingModal(null);
      setDrawingPassword("");
      setPendingReplaceFile(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload gagal";
      if (drawingModal) setDrawingError(msg);
      else alert(msg);
    } finally {
      setLoading(false);
      setUploadStatus("");
      if (fileRef.current) fileRef.current.value = "";
      if (replaceFileRef.current) replaceFileRef.current.value = "";
    }
  }

  async function deleteDrawing() {
    if (!activeFloorId) return;
    if (!drawingPassword) {
      setDrawingError("Password wajib diisi");
      return;
    }
    setLoading(true);
    setDrawingError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/drawing`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: drawingPassword }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal hapus drawing");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? { ...f, drawingUrl: null, drawingHiUrl: null }
            : f
        )
      );
      setPlotMode(false);
      setDrawingModal(null);
      setDrawingPassword("");
    } catch (err) {
      setDrawingError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmReplaceDrawing(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingReplaceFile) {
      setDrawingError("Pilih file drawing dulu");
      return;
    }
    if (!drawingPassword) {
      setDrawingError("Password wajib diisi");
      return;
    }
    await uploadDrawing(pendingReplaceFile, drawingPassword);
  }

  function onPlotMarker(x: number, y: number) {
    if (!plotMode || !canManage) return;
    setPendingPos({ x, y });
    setMarkerLabel("");
    setMarkerProfile("1D_CR_CR");
    setMarkerKeyswitch(false);
    setMarkerModal(true);
  }

  function startRegionEdit() {
    if (!activeFloor || !canManage) return;
    setPlotMode(false);
    setDetectOpen(false);
    setToggleError("");
    setRegionDraft(activeFloor.plotRegion ?? null);
    setRegionEdit(true);
  }

  function cancelRegionEdit() {
    setRegionEdit(false);
    setRegionDraft(null);
  }

  async function saveRegion(region: PlotRegion | null) {
    if (!activeFloorId || !activeFloor) return;
    if (region && (region.w < MIN_REGION_SIZE || region.h < MIN_REGION_SIZE)) {
      setToggleError("Area terlalu kecil — drag kotak yang mencakup denah.");
      return;
    }
    const outside = region
      ? activeFloor.markers.filter((m) => !pointInRegion(m.x, m.y, region))
      : [];
    const removeOutside =
      outside.length > 0 &&
      confirm(
        `${outside.length} plot berada di luar area ini. Hapus plot tersebut? (Yang sudah ada progress tidak ikut terhapus. Pilih Batal untuk membiarkannya.)`
      );
    setRegionSaving(true);
    setToggleError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/plot-region`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region, removeOutside }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan area");
      const deleted = new Set<string>(
        Array.isArray(data.deletedIds) ? data.deletedIds : []
      );
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                plotRegion: data.region ?? null,
                markers: f.markers.filter((m) => !deleted.has(m.id)),
              }
            : f
        )
      );
      if (selectedMarkerId && deleted.has(selectedMarkerId)) {
        setSelectedMarkerId(null);
      }
      setRegionEdit(false);
      setRegionDraft(null);
      const notes: string[] = [];
      if (deleted.size > 0) notes.push(`${deleted.size} plot di luar area dihapus`);
      if (data.skippedLocked > 0) {
        notes.push(`${data.skippedLocked} dilewati karena sudah ada progress`);
      }
      if (notes.length > 0) setToggleError(notes.join(" · "));
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Error");
    } finally {
      setRegionSaving(false);
    }
  }

  async function startDetectPoints() {
    if (!activeFloorId || !canManage) return;
    setPlotMode(false);
    setDetectOpen(true);
    setDetectLoading(true);
    setDetectError("");
    setDetectPoints([]);
    setDetectSelected(new Set());
    setDetectSkipped(0);
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/detect-points`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal deteksi");
      const pts = Array.isArray(data.points) ? data.points : [];
      setDetectPoints(pts);
      setDetectSelected(
        new Set(
          pts
            .filter((p: { markerId?: string | null }) => !p.markerId)
            .map((p: { id: string }) => p.id)
        )
      );
      setDetectSkipped(Number(data.skippedExisting) || 0);
      const painted = Array.isArray(data.painted) ? data.painted : [];
      if (painted.length > 0) {
        const byId = new Map<string, string>(
          painted.map((u: { id: string; color: string }) => [u.id, u.color])
        );
        setFloors((prev) =>
          prev.map((f) =>
            f.id === activeFloorId
              ? {
                  ...f,
                  markers: f.markers.map((m) =>
                    byId.has(m.id) ? { ...m, color: byId.get(m.id) } : m
                  ),
                }
              : f
          )
        );
      }
      if (pts.length === 0) {
        setDetectError(
          "Tidak ketemu titik berwarna. Coba drawing yang titiknya lebih kontras."
        );
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Error");
    } finally {
      setDetectLoading(false);
    }
  }

  function toggleDetectId(id: string) {
    setDetectSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDetectFamily(family: string) {
    const ids = detectPoints.filter((p) => p.family === family).map((p) => p.id);
    setDetectSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function applyDetectPoints(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFloorId) return;
    const selected = detectPoints.filter(
      (p) => detectSelected.has(p.id) && !p.markerId
    );
    if (selected.length === 0) {
      setDetectError(
        "Pilih titik yang belum ada plotnya, atau hapus plot lama dulu."
      );
      return;
    }
    setDetectApplying(true);
    setDetectError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/detect-points`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prefix: detectPrefix,
            profileCode: detectProfile,
            hasKeyswitch: detectKeyswitch,
            points: selected.map((p) => ({
              x: p.x,
              y: p.y,
              color: p.color,
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal plot");
      const created = Array.isArray(data.markers) ? data.markers : [];
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                markers: [
                  ...f.markers,
                  ...created.map((m: Marker) => ({
                    ...m,
                    items: m.items || [],
                  })),
                ],
              }
            : f
        )
      );
      if (created[0]?.id) setSelectedMarkerId(created[0].id);
      const skipped = Number(data.skipped) || selected.length - created.length;
      setDetectOpen(false);
      setDetectPoints([]);
      setDetectSelected(new Set());
      if (skipped > 0) {
        setToggleError(
          `${created.length} titik diplot, ${skipped} dilewati karena sudah ada plot di lokasi yang sama.`
        );
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Error");
    } finally {
      setDetectApplying(false);
    }
  }

  async function deleteDetectPlots() {
    if (!activeFloorId) return;
    const selected = detectPoints.filter(
      (p) => detectSelected.has(p.id) && p.markerId
    );
    if (selected.length === 0) {
      setDetectError(
        "Filter dulu warna/titik yang sudah ada plotnya, baru hapus."
      );
      return;
    }
    if (
      !confirm(
        `Hapus ${selected.length} plot yang cocok dengan filter terpilih? Titik yang sudah ada progress tidak ikut terhapus.`
      )
    ) {
      return;
    }
    setDetectDeleting(true);
    setDetectError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/detect-points`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            points: selected.map((p) => ({
              x: p.x,
              y: p.y,
              markerId: p.markerId,
            })),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      const deleted = new Set<string>(
        Array.isArray(data.deletedIds) ? data.deletedIds : []
      );
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                markers: f.markers.filter((m) => !deleted.has(m.id)),
              }
            : f
        )
      );
      setDetectPoints((prev) =>
        prev.map((p) =>
          p.markerId && deleted.has(p.markerId) ? { ...p, markerId: null } : p
        )
      );
      setDetectSkipped((n) => Math.max(0, n - deleted.size));
      if (selectedMarkerId && deleted.has(selectedMarkerId)) {
        setSelectedMarkerId(null);
      }
      if (data.skippedLocked > 0) {
        setDetectError(
          `${deleted.size} plot dihapus · ${data.skippedLocked} dilewati karena sudah ada progress`
        );
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Error");
    } finally {
      setDetectDeleting(false);
    }
  }

  async function createMarker(e: React.FormEvent) {
    e.preventDefault();
    if (!activeFloorId || !pendingPos) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/marker`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: markerLabel,
            x: pendingPos.x,
            y: pendingPos.y,
            profileCode: markerProfile,
            hasKeyswitch: markerKeyswitch,
            color: markerColor,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                markers: [
                  ...f.markers,
                  {
                    ...data,
                    items: data.items || [],
                  },
                ],
              }
            : f
        )
      );
      setSelectedMarkerId(data.id);
      setMarkerModal(false);
      setPlotMode(false);
      setPendingPos(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function openProfileEdit(m: Marker) {
    if (!canEditBreakdown) return;
    const code = (DOOR_PROFILES.find((p) => p.code === m.profileCode)?.code ||
      "1D_CR_CR") as DoorProfileCode;
    setEditMarkerLabel(m.label);
    setEditProfileCode(code);
    setEditHasKeyswitch(!!m.hasKeyswitch && profileAllowsKeyswitch(code));
    const family = m.color ? colorFamilyFromHex(m.color) : null;
    setEditMarkerColor(
      family && family !== "Lainnya"
        ? COLOR_FAMILY_SWATCH[family] ?? m.color ?? null
        : m.color ?? null
    );
    setError("");
    setProfileEditModal(true);
  }

  async function saveProfileEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditBreakdown || !selectedMarkerId) return;
    if (!editMarkerLabel.trim()) {
      setError("Nama titik wajib");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/project/${projectId}/marker/${selectedMarkerId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: editMarkerLabel.trim(),
            profileCode: editProfileCode,
            hasKeyswitch: editHasKeyswitch,
            color: editMarkerColor,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setFloors((prev) =>
        prev.map((f) => ({
          ...f,
          markers: f.markers.map((m) =>
            m.id === selectedMarkerId
              ? {
                  ...m,
                  ...data,
                  items: data.items || [],
                }
              : m
          ),
        }))
      );
      setProfileEditModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function createItem(markerId: string) {
    if (!canEditBreakdown) return;
    const draft = drafts[markerId] || { name: "", bobot: "" };
    if (!draft.name.trim() || !draft.bobot) {
      alert("Isi nama pekerjaan dan bobot");
      return;
    }
    if (!activeFloorId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/project/${projectId}/marker/${markerId}/item`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim(),
            bobot: parseFloat(draft.bobot),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                markers: f.markers.map((m) =>
                  m.id === markerId
                    ? { ...m, items: [...m.items, data] }
                    : m
                ),
              }
            : f
        )
      );
      setDrafts((prev) => ({ ...prev, [markerId]: { name: "", bobot: "" } }));
      setSelectedMarkerId(markerId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadItemPhoto(itemId: string, file: File) {
    setToggleError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `/api/project/${projectId}/item/${itemId}/photo`,
      { method: "POST", body: form }
    );
    const data = await res.json();
    if (!res.ok) {
      setToggleError(data.error || "Gagal upload foto");
      return;
    }
    applyItemUpdate(itemId, data);
  }

  async function removeItemPhoto(itemId: string, url: string) {
    setToggleError("");
    const res = await fetch(
      `/api/project/${projectId}/item/${itemId}/photo?url=${encodeURIComponent(url)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    if (!res.ok) {
      setToggleError(data.error || "Gagal hapus foto");
      return;
    }
    applyItemUpdate(itemId, data);
  }

  async function uploadBlockerPhoto(file: File) {
    if (!selectedMarkerId) return;
    setMrMsg("");
    setMrActing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/project/${projectId}/marker/${selectedMarkerId}/daily-report/photo`,
        { method: "POST", body: form }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload foto blocker");
      setMarkerReport(data.report);
    } catch (err) {
      setMrMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setMrActing(false);
    }
  }

  async function removeBlockerPhoto(url: string) {
    if (!selectedMarkerId) return;
    setMrMsg("");
    setMrActing(true);
    try {
      const res = await fetch(
        `/api/project/${projectId}/marker/${selectedMarkerId}/daily-report/photo?url=${encodeURIComponent(url)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal hapus foto");
      setMarkerReport(data.report);
    } catch (err) {
      setMrMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setMrActing(false);
    }
  }

  /** Balik ke halaman asal (Pending Approval) setelah titik ini diputuskan */
  function backToReturnPage() {
    if (!returnTo) return;
    router.push(returnTo);
    router.refresh();
  }

  async function applyItemUpdate(itemId: string, data: BreakdownItem) {
    if (!activeFloorId) return;
    setFloors((prev) =>
      prev.map((f) =>
        f.id === activeFloorId
          ? {
              ...f,
              markers: f.markers.map((m) => ({
                ...m,
                items: m.items.map((i) => (i.id === itemId ? { ...i, ...data } : i)),
              })),
            }
          : f
      )
    );
  }

  function setItemPendingPct(
    itemId: string,
    step: ProgressStep,
    currentPct: number
  ) {
    if (step <= currentPct) return;
    setPendingPct((prev) => {
      if (prev[itemId] === step) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: step };
    });
  }

  async function submitReport(markerId: string) {
    const marker = floors
      .flatMap((f) => f.markers)
      .find((m) => m.id === markerId);
    if (!marker) return;

    const payload = marker.items
      .filter((i) => {
        const st = itemStatus(i);
        const sel = pendingPct[i.id];
        return st === "OPEN" && sel != null && sel > (i.progressPct || 0);
      })
      .map((i) => ({ id: i.id, pct: pendingPct[i.id]! }));

    if (payload.length === 0 && !mrBlocker.trim() && !mrNotes.trim()) {
      setToggleError(
        "Centang progress (25/50/75/100) dan/atau isi blocker/catatan, lalu Submit Report"
      );
      return;
    }

    setToggleError("");
    setMrMsg("");
    setLoading(true);
    setMrActing(true);
    try {
      if (payload.length > 0) {
        const res = await fetch(
          `/api/project/${projectId}/marker/${markerId}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: payload }),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal submit pekerjaan");
        const updatedMap = Object.fromEntries(
          (data.items as BreakdownItem[]).map((i) => [i.id, i])
        );
        setFloors((prev) =>
          prev.map((f) => ({
            ...f,
            markers: f.markers.map((m) =>
              m.id === markerId
                ? {
                    ...m,
                    items: m.items.map((i) => updatedMap[i.id] || i),
                  }
                : m
            ),
          }))
        );
        setPendingPct((prev) => {
          const next = { ...prev };
          for (const row of payload) delete next[row.id];
          return next;
        });
      }

      const res = await fetch(
        `/api/project/${projectId}/marker/${markerId}/daily-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            blocker: mrBlocker,
            notes: mrNotes,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal submit laporan");
      setMarkerReport(data.report);
      setMrBlocker(data.report.blocker || "");
      setMrNotes(data.report.notes || "");
      setMrMsg("Report terkirim ke SM.");
      setPendingIds((prev) =>
        prev.includes(markerId) ? prev : [...prev, markerId]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      setToggleError(msg);
      setMrMsg(msg);
    } finally {
      setLoading(false);
      setMrActing(false);
    }
  }

  /** SM menandai item terima/tolak — belum dikirim, menunggu Approve titik */
  function setItemDecision(itemId: string, decision: "accept" | "reject") {
    setToggleError("");
    setMrMsg("");
    setItemDecisions((prev) => {
      if (prev[itemId] === decision) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: decision };
    });
  }

  async function sendItemReview(itemId: string, action: "approve" | "reject") {
    const res = await fetch(`/api/project/${projectId}/item/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Gagal update pekerjaan");
    await applyItemUpdate(itemId, data);
  }

  /**
   * Keputusan final per titik.
   * approve: kunci semua keputusan item, lalu approve laporan titik.
   * reject: semua pekerjaan yang menunggu dikembalikan ke Leader.
   */
  async function finalizeMarker(action: "approve" | "reject") {
    if (!selectedMarkerId || !selectedMarker) return;
    const submitted = selectedMarker.items.filter(
      (i) => itemStatus(i) === "SUBMITTED"
    );

    if (action === "approve") {
      const undecided = submitted.filter((i) => !itemDecisions[i.id]);
      if (undecided.length > 0) {
        setMrMsg(
          `Masih ada ${undecided.length} pekerjaan yang belum ditandai terima / tolak`
        );
        return;
      }
    } else if (submitted.length > 0) {
      const ok = confirm(
        `Tolak titik ini? ${submitted.length} pekerjaan dikembalikan ke Leader, termasuk yang sudah ditandai terima.`
      );
      if (!ok) return;
    }

    setToggleError("");
    setMrMsg("");
    setLoading(true);
    setMrActing(true);
    try {
      for (const item of submitted) {
        const accepted =
          action === "approve" && itemDecisions[item.id] === "accept";
        await sendItemReview(item.id, accepted ? "approve" : "reject");
      }
      setItemDecisions({});
    } catch (err) {
      setMrMsg(err instanceof Error ? err.message : "Error");
      setLoading(false);
      setMrActing(false);
      return;
    }
    setLoading(false);
    setMrActing(false);

    if (markerReport?.status === "SUBMITTED") {
      await runMarkerReport(action);
      return;
    }

    setMrMsg(
      action === "approve" ? "Titik di-approve." : "Titik dikembalikan ke Leader."
    );
    backToReturnPage();
  }

  function openEditItem(item: BreakdownItem) {
    if (!canEditBreakdown) return;
    setEditItem(item);
    setEditName(item.name);
    setEditBobot(String(item.bobot));
    setEditError("");
  }

  async function saveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditBreakdown || !editItem) return;
    const bobot = parseFloat(editBobot);
    if (!editName.trim() || Number.isNaN(bobot)) {
      setEditError("Nama dan bobot wajib diisi");
      return;
    }
    setLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/project/${projectId}/item/${editItem.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), bobot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal update");
      await applyItemUpdate(editItem.id, data);
      setEditItem(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(item: BreakdownItem) {
    if (!canEditBreakdown) return;
    if (!confirm(`Hapus pekerjaan "${item.name}"?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/project/${projectId}/item/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal hapus");
      if (!activeFloorId) return;
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? {
                ...f,
                markers: f.markers.map((m) => ({
                  ...m,
                  items: m.items.filter((i) => i.id !== item.id),
                })),
              }
            : f
        )
      );
      setPendingPct((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteMarker(markerId: string) {
    if (!confirm("Hapus marker ini?")) return;
    const res = await fetch(`/api/project/${projectId}/marker/${markerId}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setFloors((prev) =>
      prev.map((f) =>
        f.id === activeFloorId
          ? { ...f, markers: f.markers.filter((m) => m.id !== markerId) }
          : f
      )
    );
    if (selectedMarkerId === markerId) setSelectedMarkerId(null);
  }

  const floorProgress = activeFloor
    ? calcFloorProgress(activeFloor.markers)
    : 0;
  const floorColorCounts = useMemo(
    () => countMarkersByColor(activeFloor?.markers ?? []),
    [activeFloor?.markers]
  );
  const projectColorCounts = useMemo(
    () => countMarkersByColor(floors.flatMap((f) => f.markers)),
    [floors]
  );

  const splitMode = !!selectedMarkerId;
  const selectedMarker = activeFloor?.markers.find(
    (m) => m.id === selectedMarkerId
  );

  return (
    <div
      className={cn(
        splitMode
          ? "flex h-[calc(100dvh-3.5rem-1.5rem)] flex-col gap-2 overflow-hidden sm:h-[calc(100dvh-3.5rem-2rem)] lg:h-[calc(100dvh-3.5rem-3rem)]"
          : "space-y-4"
      )}
    >
      {returnTo && (
        <Link
          href={returnTo}
          className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Pending Approval
        </Link>
      )}

      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setActiveFloorId(f.id);
              setSelectedMarkerId(null);
              setRegionEdit(false);
              setRegionDraft(null);
            }}
            onDoubleClick={(e) => {
              if (!canManage) return;
              e.preventDefault();
              openRenameFloor(f);
            }}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              f.id === activeFloorId
                ? "bg-brand text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
            title={canManage ? "Double-klik untuk ubah nama" : undefined}
          >
            {f.name}
          </button>
        ))}
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={openAddFloor}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Lantai
          </Button>
        )}
      </div>

      {!activeFloor ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-300">
          <p className="text-sm text-slate-500">
            Belum ada lantai. Tambahkan lantai untuk mulai.
          </p>
        </div>
      ) : (
        <div
          className={cn(
            splitMode ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-4"
          )}
        >
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-900">
                  {activeFloor.name}
                </h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => openRenameFloor(activeFloor)}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                    title="Ubah nama lantai"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500">
                Progress lantai:{" "}
                <span className="text-lg font-bold text-slate-900">
                  {floorProgress}%
                </span>
                <span className="ml-1 text-xs text-slate-400">
                  (rata-rata {activeFloor.markers.length || 0} marker)
                </span>
              </p>
              {floorColorCounts.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {floorColorCounts.map((row) => (
                    <span
                      key={row.family}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                      title={`${row.count} plot ${row.family} di lantai ini`}
                    >
                      <span
                        className="h-2 w-2 rounded-full border border-slate-200"
                        style={{ backgroundColor: row.color }}
                      />
                      {row.family}
                      <span className="tabular-nums text-slate-500">
                        {row.count}
                      </span>
                    </span>
                  ))}
                  {projectColorCounts.length > 1 &&
                    floors.length > 1 &&
                    projectColorCounts.reduce((n, r) => n + r.count, 0) >
                      (activeFloor.markers.length || 0) && (
                      <span className="text-[10px] text-slate-400">
                        semua lantai:{" "}
                        {projectColorCounts
                          .map((r) => `${r.family} ${r.count}`)
                          .join(" · ")}
                      </span>
                    )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFloor.drawingUrl && activeFloor.markers.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowLabels((v) => !v)}
                  title={
                    showLabels
                      ? "Sembunyikan judul marker"
                      : "Tampilkan judul marker"
                  }
                >
                  {showLabels ? (
                    <EyeOff className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <Eye className="mr-1 h-3.5 w-3.5" />
                  )}
                  {showLabels ? "Hide Judul" : "Show Judul"}
                </Button>
              )}
              {canManage && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={DRAWING_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadDrawing(file);
                    }}
                  />
                  <input
                    ref={replaceFileRef}
                    type="file"
                    accept={DRAWING_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const invalid = drawingFileError(file);
                      if (invalid) {
                        alert(invalid);
                        e.target.value = "";
                        return;
                      }
                      setPendingReplaceFile(file);
                      setDrawingPassword("");
                      setDrawingError("");
                      setDrawingModal("replace");
                    }}
                  />
                  {!activeFloor.drawingUrl ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileRef.current?.click()}
                      disabled={loading}
                      title="Upload JPG, PNG, WEBP, TIFF, atau PDF (max 100MB)"
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {uploadStatus || (loading ? "Uploading..." : "Upload Drawing")}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => replaceFileRef.current?.click()}
                        disabled={loading}
                        title="Ganti drawing (butuh password)"
                      >
                        <RefreshCw className="mr-1 h-3.5 w-3.5" />
                        Ganti
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setDrawingPassword("");
                          setDrawingError("");
                          setDrawingModal("delete");
                        }}
                        disabled={loading}
                        title="Hapus drawing (butuh password)"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Hapus
                      </Button>
                    </>
                  )}
                  <Button
                    variant={plotMode ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setPlotMode(!plotMode)}
                    disabled={!activeFloor.drawingUrl}
                  >
                    <MapPin className="mr-1 h-3.5 w-3.5" />
                    {plotMode ? "Klik drawing..." : "Plot Marker"}
                  </Button>
                  <Button
                    variant={
                      regionEdit || activeFloor.plotRegion
                        ? "primary"
                        : "secondary"
                    }
                    size="sm"
                    onClick={startRegionEdit}
                    disabled={!activeFloor.drawingUrl || regionSaving}
                    title="Tentukan area denah supaya legend/judul tidak ikut terdeteksi"
                  >
                    <Crop className="mr-1 h-3.5 w-3.5" />
                    {activeFloor.plotRegion ? "Area plot ✓" : "Area plot"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={startDetectPoints}
                    disabled={!activeFloor.drawingUrl || detectLoading}
                    title="Deteksi titik berwarna di drawing, lalu konfirmasi"
                  >
                    <ScanSearch className="mr-1 h-3.5 w-3.5" />
                    {detectLoading ? "Mendeteksi..." : "Deteksi titik"}
                  </Button>
                </>
              )}
            </div>
          </div>

          {toggleError && (
            <p className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {toggleError}
            </p>
          )}

          <div
            className={cn(splitMode && "flex min-h-0 flex-1 flex-col gap-2")}
          >
          {regionEdit && canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <p className="min-w-0 flex-1">
                Drag di drawing untuk menggambar kotak yang mencakup{" "}
                <span className="font-semibold">denah saja</span> — legend,
                judul, dan margin di luar kotak tidak akan dideteksi. Scroll /
                mini-map untuk zoom &amp; geser.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => saveRegion(regionDraft)}
                disabled={
                  regionSaving ||
                  !regionDraft ||
                  regionDraft.w < MIN_REGION_SIZE ||
                  regionDraft.h < MIN_REGION_SIZE
                }
              >
                {regionSaving ? "Menyimpan..." : "Simpan area"}
              </Button>
              {activeFloor.plotRegion && (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => saveRegion(null)}
                  disabled={regionSaving}
                >
                  Hapus area
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={cancelRegionEdit}
                disabled={regionSaving}
              >
                Batal
              </Button>
            </div>
          )}
          <FloorMap
            drawingUrl={activeFloor.drawingUrl ?? null}
            drawingHiUrl={activeFloor.drawingHiUrl ?? null}
            floorName={activeFloor.name}
            markers={activeFloor.markers.map((m) => ({
              id: m.id,
              label: m.label,
              x: m.x,
              y: m.y,
              progress: calcMarkerProgress(m.items),
              awaiting: pendingIds.includes(m.id),
              color: m.color,
            }))}
            selectedMarkerId={selectedMarkerId}
            showLabels={showLabels}
            plotMode={plotMode && canManage}
            splitMode={splitMode}
            ghostPoints={
              detectOpen
                ? detectPoints.map((p) => ({
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    color: p.color,
                    selected: detectSelected.has(p.id),
                    label: p.markerId
                      ? `${p.family} · sudah plot`
                      : `${p.family} ${p.id}`,
                  }))
                : []
            }
            onSelectMarker={(id) => setSelectedMarkerId(id)}
            onPlot={onPlotMarker}
            onGhostClick={toggleDetectId}
            plotRegion={
              canManage && (regionEdit || detectOpen)
                ? regionEdit
                  ? regionDraft
                  : (activeFloor.plotRegion ?? null)
                : null
            }
            regionEdit={regionEdit && canManage}
            onRegionDraw={setRegionDraft}
          />

          {/* Breakdown: setengah bawah, scroll sendiri */}
          {splitMode && selectedMarker && (() => {
            const m = selectedMarker;
            const progress = calcMarkerProgress(m.items);
            const draft = drafts[m.id] || { name: "", bobot: "" };
            return (
              <div
                id={`marker-card-${m.id}`}
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
                      {m.color && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-200"
                          style={{ backgroundColor: m.color }}
                        />
                      )}
                      <span className="truncate">{m.label}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {profileLabel(m.profileCode)}
                      {m.hasKeyswitch ? " + KEYSWITCH" : ""}
                      {" · "}
                      {m.items.length} item · {progress}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {canEditBreakdown && (
                      <button
                        type="button"
                        onClick={() => openProfileEdit(m)}
                        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Ubah nama / profil"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteMarker(m.id)}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Hapus marker"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedMarkerId(null)}
                      title="Tutup panel"
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Tutup
                    </Button>
                  </div>
                </div>

                {toggleError && (
                  <p className="shrink-0 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {toggleError}
                  </p>
                )}

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-3 py-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {m.items.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Belum ada breakdown.
                      {canEditBreakdown
                        ? " Tambahkan item + bobot di bawah."
                        : ""}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {m.items.map((item) => {
                        const st = itemStatus(item);
                        const currentPct = item.progressPct || 0;
                        const selected = pendingPct[item.id];
                        const displayPct =
                          st === "SUBMITTED"
                            ? item.submittedPct ?? currentPct
                            : selected ?? currentPct;
                        return (
                          <li
                            key={item.id}
                            className="space-y-2 rounded-lg border border-slate-100 px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                              <p
                                className={cn(
                                  "text-sm font-medium",
                                  st === "APPROVED"
                                    ? "text-slate-400 line-through"
                                    : "text-slate-800"
                                )}
                              >
                                {item.name}
                              </p>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                                  st === "APPROVED" &&
                                    "bg-emerald-50 text-emerald-700",
                                  st === "SUBMITTED" &&
                                    "bg-amber-50 text-amber-700",
                                  st === "OPEN" && "bg-slate-100 text-slate-500"
                                )}
                              >
                                {st === "APPROVED"
                                  ? "100%"
                                  : st === "SUBMITTED"
                                    ? `Submit ${item.submittedPct ?? "—"}%`
                                    : currentPct > 0
                                      ? `${currentPct}%`
                                      : "0%"}
                              </span>
                              </div>
                              <p className="mt-0.5 text-xs text-slate-400">
                                Bobot {item.bobot}%
                                {st === "SUBMITTED" && item.submittedBy
                                  ? ` · submit ${item.submittedBy}`
                                  : ""}
                                {st === "APPROVED" && item.approvedBy
                                  ? ` · approved ${item.approvedBy}`
                                  : ""}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {PROGRESS_STEPS.map((step) => {
                                  const approved = step <= currentPct;
                                  const inSelection =
                                    selected != null && step <= selected;
                                  const inSubmitted =
                                    st === "SUBMITTED" &&
                                    item.submittedPct != null &&
                                    step <= item.submittedPct;
                                  const checked =
                                    approved || inSelection || inSubmitted;
                                  const canPick =
                                    canSubmit &&
                                    st === "OPEN" &&
                                    !dailyClosed &&
                                    step > currentPct;
                                  return (
                                    <label
                                      key={step}
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium",
                                        approved &&
                                          "border-emerald-200 bg-emerald-50 text-emerald-800",
                                        !approved &&
                                          (inSelection || inSubmitted) &&
                                          "border-brand bg-brand text-white",
                                        !checked &&
                                          "border-slate-200 bg-white text-slate-600",
                                        canPick
                                          ? "cursor-pointer hover:border-slate-400"
                                          : "cursor-default"
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={checked}
                                        disabled={!canPick}
                                        onChange={() =>
                                          canPick &&
                                          setItemPendingPct(
                                            item.id,
                                            step,
                                            currentPct
                                          )
                                        }
                                      />
                                      <span
                                        className={cn(
                                          "flex h-3.5 w-3.5 items-center justify-center rounded border",
                                          checked
                                            ? approved
                                              ? "border-emerald-600 bg-emerald-600 text-white"
                                              : "border-white bg-white text-slate-900"
                                            : "border-slate-300 bg-white"
                                        )}
                                      >
                                        {checked && (
                                          <Check className="h-2.5 w-2.5" />
                                        )}
                                      </span>
                                      {step}%
                                    </label>
                                  );
                                })}
                              </div>
                              {(selected || st === "SUBMITTED") &&
                                displayPct > currentPct && (
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    Laporan hari ini: {displayPct}% (efektif
                                    bobot{" "}
                                    {Math.round(
                                      (item.bobot * displayPct) / 1000
                                    ) / 10}
                                    %)
                                  </p>
                                )}
                            </div>
                            {canEditBreakdown && (
                              <div className="flex shrink-0 gap-0.5">
                                <button
                                  type="button"
                                  title="Edit item"
                                  onClick={() => openEditItem(item)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Hapus item"
                                  onClick={() => deleteItem(item)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {canApprove && st === "SUBMITTED" && (
                              <div className="flex w-full gap-2 sm:w-auto">
                                <Button
                                  size="sm"
                                  variant={
                                    itemDecisions[item.id] === "accept"
                                      ? "primary"
                                      : "secondary"
                                  }
                                  onClick={() =>
                                    setItemDecision(item.id, "accept")
                                  }
                                >
                                  {itemDecisions[item.id] === "accept" && (
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                  )}
                                  Terima {item.submittedPct ?? ""}%
                                </Button>
                                <Button
                                  size="sm"
                                  variant={
                                    itemDecisions[item.id] === "reject"
                                      ? "danger"
                                      : "secondary"
                                  }
                                  onClick={() =>
                                    setItemDecision(item.id, "reject")
                                  }
                                >
                                  Tolak
                                </Button>
                              </div>
                            )}
                            </div>
                            <EvidencePhotos
                              urls={item.photoUrls || []}
                              canEdit={
                                canSubmit &&
                                st !== "APPROVED" &&
                                !dailyClosed
                              }
                              label="Foto bukti pekerjaan"
                              onUpload={(file) => uploadItemPhoto(item.id, file)}
                              onRemove={(url) => removeItemPhoto(item.id, url)}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {canSubmit &&
                    m.items.some((i) => itemStatus(i) === "OPEN") && (
                      <p className="text-xs text-slate-500">
                        Centang progress 25/50/75/100% (boleh partial), isi
                        blocker di bawah bila perlu, lalu Submit Report
                      </p>
                    )}

                  {canEditBreakdown && (
                    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <Input
                          id={`item-name-${m.id}`}
                          label="Nama pekerjaan"
                          value={draft.name}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [m.id]: { ...draft, name: e.target.value },
                            }))
                          }
                          placeholder="Contoh: Pasang engsel"
                        />
                      </div>
                      <div className="w-full sm:w-28">
                        <Input
                          id={`item-bobot-${m.id}`}
                          label="Bobot %"
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={draft.bobot}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [m.id]: { ...draft, bobot: e.target.value },
                            }))
                          }
                          placeholder="25"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="sm:mb-0.5"
                        disabled={loading}
                        onClick={() => createItem(m.id)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Tambah
                      </Button>
                    </div>
                  )}

                  {/* Laporan harian per titik */}
                  {(canSubmit || canApprove) && (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          Laporan titik hari ini
                        </p>
                        {markerReport && (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              markerReport.status === "APPROVED" &&
                                "bg-emerald-50 text-emerald-700",
                              markerReport.status === "SUBMITTED" &&
                                "bg-amber-50 text-amber-700",
                              markerReport.status === "REJECTED" &&
                                "bg-red-50 text-red-700",
                              markerReport.status === "DRAFT" &&
                                "bg-slate-200 text-slate-600"
                            )}
                          >
                            {markerReport.status === "APPROVED"
                              ? "Approved SM"
                              : markerReport.status === "SUBMITTED"
                                ? "Menunggu SM"
                                : markerReport.status === "REJECTED"
                                  ? "Ditolak"
                                  : "Draft"}
                          </span>
                        )}
                      </div>
                      {mrLoading ? (
                        <p className="text-xs text-slate-400">Memuat...</p>
                      ) : dailyClosed ? (
                        <p className="text-xs text-red-600">
                          Laporan harian hari ini sudah ditutup (cutoff 19:00).
                        </p>
                      ) : (
                        <>
                          {(canSubmit &&
                            markerReport?.status !== "APPROVED") ||
                          !markerReport ? (
                            <>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">
                                  Blocker / kendala titik ini
                                </label>
                                <textarea
                                  value={mrBlocker}
                                  onChange={(e) => setMrBlocker(e.target.value)}
                                  rows={2}
                                  disabled={
                                    mrActing ||
                                    markerReport?.status === "APPROVED"
                                  }
                                  placeholder="Kendala khusus di titik ini (material, akses, dll)"
                                  className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                                />
                                <EvidencePhotos
                                  className="mt-2"
                                  urls={markerReport?.blockerPhotos || []}
                                  canEdit={
                                    canSubmit &&
                                    markerReport?.status !== "APPROVED" &&
                                    !dailyClosed
                                  }
                                  uploading={mrActing}
                                  label="Foto bukti blocker"
                                  onUpload={uploadBlockerPhoto}
                                  onRemove={removeBlockerPhoto}
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-slate-600">
                                  Catatan titik (opsional)
                                </label>
                                <textarea
                                  value={mrNotes}
                                  onChange={(e) => setMrNotes(e.target.value)}
                                  rows={2}
                                  disabled={
                                    mrActing ||
                                    markerReport?.status === "APPROVED"
                                  }
                                  placeholder="Catatan tambahan"
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              {markerReport.blocker && (
                                <p className="text-sm text-amber-900">
                                  <span className="font-medium">Blocker: </span>
                                  {markerReport.blocker}
                                </p>
                              )}
                              <EvidencePhotos
                                urls={markerReport.blockerPhotos || []}
                                label="Foto bukti blocker"
                              />
                              {markerReport.notes && (
                                <p className="text-sm text-slate-700">
                                  <span className="font-medium">Catatan: </span>
                                  {markerReport.notes}
                                </p>
                              )}
                            </>
                          )}

                          {markerReport?.status === "REJECTED" &&
                            markerReport.rejectReason && (
                              <p className="text-xs text-red-600">
                                Alasan tolak: {markerReport.rejectReason}
                              </p>
                            )}
                          {markerReport?.submittedBy && (
                            <p className="text-xs text-slate-500">
                              Submit: {markerReport.submittedBy}
                              {markerReport.submittedAt
                                ? ` · ${new Date(markerReport.submittedAt).toLocaleString("id-ID")}`
                                : ""}
                            </p>
                          )}

                          {canApprove &&
                            (() => {
                              const submitted = m.items.filter(
                                (i) => itemStatus(i) === "SUBMITTED"
                              );
                              if (submitted.length === 0) return null;
                              const accepted = submitted.filter(
                                (i) => itemDecisions[i.id] === "accept"
                              ).length;
                              const rejected = submitted.filter(
                                (i) => itemDecisions[i.id] === "reject"
                              ).length;
                              const undecided =
                                submitted.length - accepted - rejected;
                              return (
                                <p className="text-xs text-slate-500">
                                  Keputusan item: {accepted} terima ·{" "}
                                  {rejected} tolak ·{" "}
                                  <span
                                    className={cn(
                                      undecided > 0 &&
                                        "font-medium text-amber-700"
                                    )}
                                  >
                                    {undecided} belum ditandai
                                  </span>
                                  . Approve titik akan mengunci semua keputusan
                                  ini.
                                </p>
                              );
                            })()}

                          {mrMsg && (
                            <p className="text-xs text-slate-600">{mrMsg}</p>
                          )}

                          <div className="flex flex-wrap gap-2">
                            {canSubmit &&
                              markerReport?.status !== "APPROVED" && (
                                <Button
                                  size="sm"
                                  disabled={mrActing || loading || dailyClosed}
                                  onClick={() => submitReport(m.id)}
                                >
                                  <Send className="mr-1 h-3.5 w-3.5" />
                                  Submit Report
                                </Button>
                              )}
                            {canApprove &&
                              (markerReport?.status === "SUBMITTED" ||
                                m.items.some(
                                  (i) => itemStatus(i) === "SUBMITTED"
                                )) && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={mrActing}
                                    onClick={() => finalizeMarker("approve")}
                                  >
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                    Approve titik ini
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={mrActing}
                                    onClick={() => finalizeMarker("reject")}
                                  >
                                    Tolak titik ini
                                  </Button>
                                </>
                              )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          </div>

          {!splitMode && activeFloor.markers.length > 0 && (
            <p className="text-center text-xs text-slate-400">
              Klik marker di drawing untuk membuka breakdown
            </p>
          )}

          {!splitMode && activeFloor.markers.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
              Belum ada marker. Plot marker di drawing, lalu klik untuk isi
              breakdown.
            </div>
          )}
        </div>
      )}

      <Modal
        open={floorModal}
        onClose={() => {
          setFloorModal(false);
          setEditingFloorId(null);
          setFloorName("");
          setError("");
        }}
        title={editingFloorId ? "Ubah Nama Lantai" : "Tambah Lantai"}
      >
        <form onSubmit={createFloor} className="space-y-4">
          <Input
            id="floorName"
            label="Nama Lantai"
            value={floorName}
            onChange={(e) => setFloorName(e.target.value)}
            required
            placeholder="Lantai 1 / Basement / Roof"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFloorModal(false);
                setEditingFloorId(null);
                setFloorName("");
                setError("");
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {editingFloorId ? "Simpan" : "Tambah"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={markerModal}
        onClose={() => setMarkerModal(false)}
        title="Tambah Marker"
      >
        <form onSubmit={createMarker} className="space-y-4">
          <Input
            id="markerLabel"
            label="Label Marker"
            value={markerLabel}
            onChange={(e) => setMarkerLabel(e.target.value)}
            required
            placeholder="Pintu Utama / Zone A"
          />
          <div>
            <label
              htmlFor="markerProfile"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Profil pintu
            </label>
            <select
              id="markerProfile"
              value={markerProfile}
              onChange={(e) => {
                const code = e.target.value as DoorProfileCode;
                setMarkerProfile(code);
                if (!profileAllowsKeyswitch(code)) setMarkerKeyswitch(false);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand"
              required
            >
              {DOOR_PROFILES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </div>
          <PlotColorAssign value={markerColor} onChange={setMarkerColor} />
          {profileAllowsKeyswitch(markerProfile) && (
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={markerKeyswitch}
                onChange={(e) => setMarkerKeyswitch(e.target.checked)}
              />
              <span>
                Ada add-on <span className="font-medium">Keyswitch</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Item Keyswitch masuk checklist; bobot dibagi rata ulang.
                </span>
              </span>
            </label>
          )}
          <p className="text-xs text-slate-500">
            Checklist + bobot digenerate otomatis dari profil.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setMarkerModal(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={profileEditModal}
        onClose={() => setProfileEditModal(false)}
        title="Ubah titik"
      >
        <form onSubmit={saveProfileEdit} className="space-y-4">
          <Input
            id="editMarkerLabel"
            label="Nama titik"
            value={editMarkerLabel}
            onChange={(e) => setEditMarkerLabel(e.target.value)}
            required
            placeholder="Pintu 12"
          />
          <p className="text-sm text-slate-500">
            Mengganti profil akan regenerate checklist. Hanya bisa jika semua
            item masih OPEN (belum submit/approve). Ganti nama saja tidak
            mengubah checklist.
          </p>
          <div>
            <label
              htmlFor="editProfile"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Profil pintu
            </label>
            <select
              id="editProfile"
              value={editProfileCode}
              onChange={(e) => {
                const code = e.target.value as DoorProfileCode;
                setEditProfileCode(code);
                if (!profileAllowsKeyswitch(code)) setEditHasKeyswitch(false);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand"
              required
            >
              {DOOR_PROFILES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label} — {p.description}
                </option>
              ))}
            </select>
          </div>
          <PlotColorAssign value={editMarkerColor} onChange={setEditMarkerColor} />
          {profileAllowsKeyswitch(editProfileCode) && (
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={editHasKeyswitch}
                onChange={(e) => setEditHasKeyswitch(e.target.checked)}
              />
              <span>
                Ada add-on <span className="font-medium">Keyswitch</span>
              </span>
            </label>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProfileEditModal(false)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              Simpan
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={drawingModal === "replace"}
        onClose={() => {
          setDrawingModal(null);
          setDrawingPassword("");
          setPendingReplaceFile(null);
          setDrawingError("");
        }}
        title="Ganti Drawing"
      >
        <form onSubmit={confirmReplaceDrawing} className="space-y-4">
          <p className="text-sm text-slate-500">
            File baru:{" "}
            <span className="font-medium text-slate-800">
              {pendingReplaceFile?.name || "—"}
            </span>
          </p>
          <Input
            id="replace-password"
            label="Password akun Anda"
            type="password"
            value={drawingPassword}
            onChange={(e) => setDrawingPassword(e.target.value)}
            required
            placeholder="Masukkan password untuk konfirmasi"
            autoComplete="current-password"
          />
          {drawingError && (
            <p className="text-sm text-red-600">{drawingError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDrawingModal(null);
                setPendingReplaceFile(null);
                setDrawingPassword("");
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {uploadStatus || (loading ? "Mengganti..." : "Ganti Drawing")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={drawingModal === "delete"}
        onClose={() => {
          setDrawingModal(null);
          setDrawingPassword("");
          setDrawingError("");
        }}
        title="Hapus Drawing"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            deleteDrawing();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-500">
            Drawing akan dihapus. Marker tetap ada. Masukkan password akun untuk
            konfirmasi.
          </p>
          <Input
            id="delete-password"
            label="Password akun Anda"
            type="password"
            value={drawingPassword}
            onChange={(e) => setDrawingPassword(e.target.value)}
            required
            placeholder="Masukkan password untuk konfirmasi"
            autoComplete="current-password"
          />
          {drawingError && (
            <p className="text-sm text-red-600">{drawingError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDrawingModal(null);
                setDrawingPassword("");
              }}
            >
              Batal
            </Button>
            <Button type="submit" variant="danger" disabled={loading}>
              {loading ? "Menghapus..." : "Hapus Drawing"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit Breakdown Item"
      >
        <form onSubmit={saveEditItem} className="space-y-4">
          <Input
            id="edit-item-name"
            label="Nama pekerjaan"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <Input
            id="edit-item-bobot"
            label="Bobot %"
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={editBobot}
            onChange={(e) => setEditBobot(e.target.value)}
            required
          />
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditItem(null)}
            >
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : "Simpan"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={detectOpen}
        onClose={() => {
          if (!detectApplying && !detectDeleting) {
            setDetectOpen(false);
            setDetectError("");
          }
        }}
        title="Deteksi titik otomatis"
        className="sm:max-w-lg"
      >
        <form onSubmit={applyDetectPoints} className="space-y-4">
          <p className="text-sm text-slate-500">
            Filter warna/centang dulu. Plot untuk titik baru, atau hapus plot
            yang sudah ada sesuai filter yang sama.
          </p>
          {activeFloor?.plotRegion ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Hanya area plot yang dipindai — legend, judul, dan margin di luar
              kotak diabaikan.
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Area plot belum diatur, jadi seluruh gambar dipindai (ikon legend
              ikut terbaca).{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  setDetectOpen(false);
                  startRegionEdit();
                }}
              >
                Atur area plot
              </button>
            </p>
          )}
          {detectLoading ? (
            <p className="text-sm text-slate-500">Membaca drawing…</p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                Ketemu{" "}
                <span className="font-semibold">{detectPoints.length}</span>{" "}
                titik
                {detectSkipped > 0 ? ` · ${detectSkipped} sudah ada plot` : ""}
                {detectSelected.size > 0
                  ? ` · ${detectSelected.size} dipilih`
                  : ""}
              </p>
              {detectPoints.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(
                    new Set(detectPoints.map((p) => p.family))
                  ).map((family) => {
                    const ids = detectPoints.filter((p) => p.family === family);
                    const on = ids.every((p) => detectSelected.has(p.id));
                    const swatch =
                      ids.find((p) => p.color)?.color || "#94a3b8";
                    return (
                      <button
                        key={family}
                        type="button"
                        onClick={() => toggleDetectFamily(family)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                          on
                            ? "border-brand bg-brand text-white"
                            : "border-slate-200 bg-white text-slate-600"
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-white/40"
                          style={{ backgroundColor: swatch }}
                        />
                        {family} ({ids.length}
                        {ids.filter((p) => !p.markerId).length < ids.length
                          ? ` · ${ids.filter((p) => !p.markerId).length} baru`
                          : ""}
                        )
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setDetectSelected(
                      new Set(detectPoints.map((p) => p.id))
                    )
                  }
                  disabled={detectPoints.length === 0}
                >
                  Pilih semua
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setDetectSelected(new Set())}
                  disabled={detectSelected.size === 0}
                >
                  Kosongkan
                </Button>
              </div>
              {detectPoints.length > 0 && (
                <ul className="max-h-40 overflow-auto rounded-xl border border-slate-200">
                  {detectPoints.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 border-b border-slate-100 px-3 py-1.5 last:border-0"
                    >
                      <input
                        type="checkbox"
                        checked={detectSelected.has(p.id)}
                        onChange={() => toggleDetectId(p.id)}
                      />
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border border-slate-200"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="min-w-0 flex-1 text-xs text-slate-700">
                        {p.markerId
                          ? activeFloor?.markers.find((m) => m.id === p.markerId)
                              ?.label || "Sudah plot"
                          : `${detectPrefix.trim() || "Pintu"} ${i + 1}`}
                        <span className="ml-1 text-slate-400">{p.family}</span>
                      </span>
                      {p.markerId && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          sudah plot
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Input
                id="detectPrefix"
                label="Prefix nama"
                value={detectPrefix}
                onChange={(e) => setDetectPrefix(e.target.value)}
                placeholder="Pintu"
              />
              <div>
                <label
                  htmlFor="detectProfile"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Profil pintu (semua titik terpilih)
                </label>
                <select
                  id="detectProfile"
                  value={detectProfile}
                  onChange={(e) => {
                    const code = e.target.value as DoorProfileCode;
                    setDetectProfile(code);
                    if (!profileAllowsKeyswitch(code)) {
                      setDetectKeyswitch(false);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand"
                >
                  {DOOR_PROFILES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>
              </div>
              {profileAllowsKeyswitch(detectProfile) && (
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={detectKeyswitch}
                    onChange={(e) => setDetectKeyswitch(e.target.checked)}
                  />
                  <span>
                    Ada add-on <span className="font-medium">Keyswitch</span>
                  </span>
                </label>
              )}
            </>
          )}
          {detectError && (
            <p className="text-sm text-red-600">{detectError}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={detectApplying || detectDeleting}
              onClick={() => {
                setDetectOpen(false);
                setDetectError("");
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={
                detectLoading ||
                detectApplying ||
                detectDeleting ||
                !detectPoints.some((p) => detectSelected.has(p.id) && p.markerId)
              }
              onClick={deleteDetectPlots}
            >
              {detectDeleting
                ? "Menghapus..."
                : `Hapus ${
                    detectPoints.filter(
                      (p) => detectSelected.has(p.id) && p.markerId
                    ).length
                  } plot`}
            </Button>
            <Button
              type="submit"
              disabled={
                detectLoading ||
                detectApplying ||
                detectDeleting ||
                !detectPoints.some((p) => detectSelected.has(p.id) && !p.markerId)
              }
            >
              {detectApplying
                ? "Plot..."
                : `Plot ${
                    detectPoints.filter(
                      (p) => detectSelected.has(p.id) && !p.markerId
                    ).length
                  } titik`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
