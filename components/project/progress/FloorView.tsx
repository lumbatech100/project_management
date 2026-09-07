"use client";

import { useEffect, useRef, useState } from "react";
import {
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
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EvidencePhotos } from "@/components/project/EvidencePhotos";
import { calcFloorProgress, calcMarkerProgress, cn } from "@/lib/utils";

interface BreakdownItem {
  id: string;
  name: string;
  bobot: number;
  status?: "OPEN" | "SUBMITTED" | "APPROVED";
  done: boolean;
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
  items: BreakdownItem[];
}

interface Floor {
  id: string;
  name: string;
  drawingUrl?: string | null;
  markers: Marker[];
}

interface FloorViewProps {
  projectId: string;
  floors: Floor[];
  canManage: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  pendingMarkerIds?: string[];
  initialMarkerId?: string | null;
}

function itemStatus(item: BreakdownItem): "OPEN" | "SUBMITTED" | "APPROVED" {
  if (item.status) return item.status;
  return item.done ? "APPROVED" : "OPEN";
}

function floorIdForMarker(floors: Floor[], markerId: string | null | undefined) {
  if (!markerId) return null;
  return floors.find((f) => f.markers.some((m) => m.id === markerId))?.id ?? null;
}

export function FloorView({
  projectId,
  floors: initialFloors,
  canManage,
  canSubmit,
  canApprove,
  pendingMarkerIds = [],
  initialMarkerId = null,
}: FloorViewProps) {
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
  /** Leader: itemIds yang dicentang siap submit (per marker) */
  const [pendingChecks, setPendingChecks] = useState<Record<string, boolean>>(
    {}
  );

  const [floorModal, setFloorModal] = useState(false);
  const [floorName, setFloorName] = useState("");
  const [markerModal, setMarkerModal] = useState(false);
  const [markerLabel, setMarkerLabel] = useState("");
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

  const fileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const activeFloor = floors.find((f) => f.id === activeFloorId);

  // Wait until layout has real width — img with w-full can stay 0-height on first paint
  useEffect(() => {
    const el = mapWrapRef.current;
    if (!el) return;
    const update = () => setMapReady(el.clientWidth > 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeFloorId]);

  useEffect(() => {
    setMapLoaded(false);
  }, [activeFloorId, activeFloor?.drawingUrl]);

  useEffect(() => {
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
      }
      if (action === "reject") {
        setMrMsg("Laporan titik ditolak.");
        setPendingIds((prev) => prev.filter((id) => id !== selectedMarkerId));
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
      const res = await fetch(`/api/project/${projectId}/floor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: floorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setFloors((prev) => [...prev, { ...data, markers: [] }]);
      setActiveFloorId(data.id);
      setFloorModal(false);
      setFloorName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadDrawing(file: File, password?: string) {
    if (!activeFloorId) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["jpg", "jpeg", "png"].includes(ext)) {
      alert("Format drawing harus JPG atau PNG");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      alert("Ukuran file maksimal 30MB");
      return;
    }

    setLoading(true);
    setDrawingError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (password) form.append("password", password);
      const res = await fetch(
        `/api/project/${projectId}/floor/${activeFloorId}/upload`,
        { method: "POST", body: form }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload gagal");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId ? { ...f, drawingUrl: data.drawingUrl } : f
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
          f.id === activeFloorId ? { ...f, drawingUrl: null } : f
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
      setDrawingError("Pilih file JPG/PNG dulu");
      return;
    }
    if (!drawingPassword) {
      setDrawingError("Password wajib diisi");
      return;
    }
    await uploadDrawing(pendingReplaceFile, drawingPassword);
  }

  function onDrawingClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!plotMode || !canManage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPendingPos({ x, y });
    setMarkerLabel("");
    setMarkerModal(true);
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
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal");
      setFloors((prev) =>
        prev.map((f) =>
          f.id === activeFloorId
            ? { ...f, markers: [...f.markers, { ...data, items: [] }] }
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

  async function createItem(markerId: string) {
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

  function togglePending(itemId: string) {
    setPendingChecks((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  async function submitReport(markerId: string) {
    const marker = floors
      .flatMap((f) => f.markers)
      .find((m) => m.id === markerId);
    if (!marker) return;

    const ids = marker.items
      .filter((i) => itemStatus(i) === "OPEN" && pendingChecks[i.id])
      .map((i) => i.id);

    if (ids.length === 0 && !mrBlocker.trim() && !mrNotes.trim()) {
      setToggleError(
        "Centang pekerjaan selesai dan/atau isi blocker/catatan, lalu Submit Report"
      );
      return;
    }

    setToggleError("");
    setMrMsg("");
    setLoading(true);
    setMrActing(true);
    try {
      if (ids.length > 0) {
        const res = await fetch(
          `/api/project/${projectId}/marker/${markerId}/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemIds: ids }),
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
        setPendingChecks((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
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

  async function reviewItem(item: BreakdownItem, action: "approve" | "reject") {
    setToggleError("");
    const res = await fetch(`/api/project/${projectId}/item/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setToggleError(data.error || "Gagal update");
      return;
    }
    const data = await res.json();
    await applyItemUpdate(item.id, data);
  }

  function openEditItem(item: BreakdownItem) {
    setEditItem(item);
    setEditName(item.name);
    setEditBobot(String(item.bobot));
    setEditError("");
  }

  async function saveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editItem) return;
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
      setPendingChecks((prev) => {
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

  function selectMarker(id: string) {
    if (selectedMarkerId === id) {
      setSelectedMarkerId(null);
      return;
    }
    setSelectedMarkerId(id);
  }

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
      <div className="flex shrink-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {floors.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setActiveFloorId(f.id);
              setSelectedMarkerId(null);
            }}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              f.id === activeFloorId
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {f.name}
          </button>
        ))}
        {canManage && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setFloorModal(true)}
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
              <h2 className="font-semibold text-slate-900">{activeFloor.name}</h2>
              <p className="text-sm text-slate-500">
                Progress lantai:{" "}
                <span className="text-lg font-bold text-slate-900">
                  {floorProgress}%
                </span>
                <span className="ml-1 text-xs text-slate-400">
                  (rata-rata {activeFloor.markers.length || 0} marker)
                </span>
              </p>
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
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadDrawing(file);
                    }}
                  />
                  <input
                    ref={replaceFileRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const ext = file.name.split(".").pop()?.toLowerCase();
                      if (!ext || !["jpg", "jpeg", "png"].includes(ext)) {
                        alert("Format drawing harus JPG atau PNG");
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
                      title="Upload JPG atau PNG (max 30MB)"
                    >
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {loading ? "Uploading..." : "Upload Drawing"}
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
            className={cn(
              splitMode && "flex min-h-0 flex-1 flex-col gap-2"
            )}
          >
          <div
            ref={mapWrapRef}
            className={cn(
              "relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50",
              plotMode && "cursor-crosshair ring-2 ring-slate-900",
              splitMode && "min-h-0 flex-1 overflow-auto",
              activeFloor.drawingUrl && !mapLoaded && "min-h-48"
            )}
            onClick={onDrawingClick}
          >
            {activeFloor.drawingUrl ? (
              mapReady ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={activeFloor.drawingUrl}
                  src={
                    activeFloor.drawingUrl.startsWith("/uploads/")
                      ? `/api/uploads/${activeFloor.drawingUrl.slice("/uploads/".length)}`
                      : activeFloor.drawingUrl
                  }
                  alt={activeFloor.name}
                  className="block h-auto w-full max-w-full select-none"
                  draggable={false}
                  decoding="async"
                  ref={(img) => {
                    if (img?.complete && img.naturalWidth > 0) {
                      setMapLoaded(true);
                    }
                  }}
                  onLoad={() => setMapLoaded(true)}
                  onError={() => setMapLoaded(false)}
                />
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-slate-400">
                  Menyiapkan map…
                </div>
              )
            ) : (
              <div className="flex h-72 items-center justify-center">
                <p className="text-sm text-slate-400">
                  Upload drawing JPG/PNG untuk lantai ini
                </p>
              </div>
            )}
            {mapLoaded &&
              activeFloor.markers.map((m) => {
              const p = calcMarkerProgress(m.items);
              const selected = selectedMarkerId === m.id;
              const done = p === 100;
              const awaiting = pendingIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectMarker(m.id);
                  }}
                  className={cn(
                    "absolute z-10 -translate-x-1/2 -translate-y-1/2 shadow transition-transform hover:z-20 hover:scale-125",
                    showLabels
                      ? "max-w-[5.5rem] truncate rounded border px-1 py-px text-[9px] font-semibold leading-tight"
                      : "h-2.5 w-2.5 rounded-full border",
                    selected
                      ? "z-20 border-slate-900 bg-slate-900 text-white ring-1 ring-slate-900/40 ring-offset-1"
                      : awaiting
                        ? "border-amber-600 bg-amber-500 text-white ring-1 ring-amber-400/50"
                        : done
                          ? "border-emerald-600 bg-emerald-500 text-white"
                          : "border-amber-500 bg-amber-400 text-slate-900"
                  )}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                  title={`${m.label} (${p}%)${awaiting ? " · menunggu approval" : ""}`}
                >
                  {showLabels ? (
                    <>
                      <span className="truncate">{m.label}</span>
                      <span className="ml-0.5 opacity-75">{p}%</span>
                      {awaiting && (
                        <span className="ml-0.5 font-bold">!</span>
                      )}
                    </>
                  ) : (
                    <span className="sr-only">
                      {m.label} {p}%
                      {awaiting ? " menunggu approval" : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Breakdown hanya muncul saat marker diklik — fokus 1 marker */}
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
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {m.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.items.length} item · progress {progress}%
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
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

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {m.items.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Belum ada breakdown. Tambahkan item + bobot di bawah.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {m.items.map((item) => {
                        const st = itemStatus(item);
                        const pending = !!pendingChecks[item.id];
                        return (
                          <li
                            key={item.id}
                            className="space-y-2 rounded-lg border border-slate-100 px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-center gap-3">
                            {canSubmit && st === "OPEN" ? (
                              <button
                                type="button"
                                onClick={() => togglePending(item.id)}
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                                  pending
                                    ? "border-slate-900 bg-slate-900 text-white"
                                    : "border-slate-300 bg-white hover:border-slate-500"
                                )}
                                title="Centang jika sudah dikerjakan"
                              >
                                {pending && <Check className="h-3 w-3" />}
                              </button>
                            ) : (
                              <span
                                className={cn(
                                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                                  st === "APPROVED"
                                    ? "border-emerald-600 bg-emerald-500 text-white"
                                    : st === "SUBMITTED"
                                      ? "border-amber-500 bg-amber-50 text-amber-700"
                                      : "border-slate-200 bg-slate-50"
                                )}
                              >
                                {st === "APPROVED" && (
                                  <Check className="h-3 w-3" />
                                )}
                                {st === "SUBMITTED" && (
                                  <span className="text-[9px] font-bold">!</span>
                                )}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
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
                              <p className="text-xs text-slate-400">
                                Bobot {item.bobot}%
                                {st === "SUBMITTED" && item.submittedBy
                                  ? ` · submit ${item.submittedBy}`
                                  : ""}
                                {st === "APPROVED" && item.approvedBy
                                  ? ` · approved ${item.approvedBy}`
                                  : ""}
                              </p>
                            </div>
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
                                ? "Approved"
                                : st === "SUBMITTED"
                                  ? "Menunggu SM"
                                  : "Open"}
                            </span>
                            {canManage && (
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
                                  onClick={() => reviewItem(item, "approve")}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => reviewItem(item, "reject")}
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
                        Centang pekerjaan yang selesai, isi blocker di bawah,
                        lalu klik Submit Report
                      </p>
                    )}

                  {canManage && (
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
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
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
                              markerReport?.status === "SUBMITTED" && (
                                <>
                                  <Button
                                    size="sm"
                                    disabled={mrActing}
                                    onClick={() => runMarkerReport("approve")}
                                  >
                                    Acc laporan titik
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={mrActing}
                                    onClick={() => runMarkerReport("reject")}
                                  >
                                    Tolak
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
        </div>
      )}

      <Modal
        open={floorModal}
        onClose={() => setFloorModal(false)}
        title="Tambah Lantai"
      >
        <form onSubmit={createFloor} className="space-y-4">
          <Input
            id="floorName"
            label="Nama Lantai"
            value={floorName}
            onChange={(e) => setFloorName(e.target.value)}
            required
            placeholder="Lantai 1 / Basement"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFloorModal(false)}
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
              {loading ? "Mengganti..." : "Ganti Drawing"}
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
    </div>
  );
}
