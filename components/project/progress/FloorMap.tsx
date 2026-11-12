"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Minus, Plus, RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { regionFromCorners, type PlotRegion } from "@/lib/plot-region";

export type FloorMapMarker = {
  id: string;
  label: string;
  x: number;
  y: number;
  progress: number;
  awaiting?: boolean;
  color?: string | null;
};

export type FloorMapGhost = {
  id: string;
  x: number;
  y: number;
  color?: string;
  selected?: boolean;
  label?: string;
};

type Props = {
  drawingUrl: string | null;
  /** Versi resolusi tinggi — dimuat setelah user zoom in */
  drawingHiUrl?: string | null;
  floorName: string;
  markers: FloorMapMarker[];
  ghostPoints?: FloorMapGhost[];
  selectedMarkerId: string | null;
  showLabels: boolean;
  plotMode: boolean;
  splitMode: boolean;
  onSelectMarker: (id: string) => void;
  onPlot: (x: number, y: number) => void;
  onGhostClick?: (id: string) => void;
  /** Area plot yang ditampilkan (luar area digelapkan). */
  plotRegion?: PlotRegion | null;
  /** Mode gambar area: drag di drawing untuk membuat kotak. */
  regionEdit?: boolean;
  onRegionDraw?: (region: PlotRegion | null) => void;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const CLUSTER_BASE_PX = 36;
/** Mulai muat versi resolusi tinggi saat zoom melewati ini */
const HI_RES_ZOOM = 1.25;
/**
 * will-change hanya selama gerak: saat aktif browser membekukan raster di
 * skala awal (gambar + teks marker burem saat zoom). Setelah diam dilepas
 * supaya dirender ulang tajam.
 */
const SETTLE_MS = 180;

type ClusterItem =
  | { type: "single"; marker: FloorMapMarker }
  | {
      type: "group";
      id: string;
      x: number;
      y: number;
      markers: FloorMapMarker[];
    };

function markerTone(m: FloorMapMarker) {
  if (m.awaiting) return "awaiting" as const;
  if (m.progress >= 100) return "done" as const;
  return "open" as const;
}

function groupTone(markers: FloorMapMarker[]) {
  if (markers.every((m) => m.progress >= 100 && !m.awaiting)) {
    return "done" as const;
  }
  if (markers.some((m) => m.awaiting)) return "awaiting" as const;
  if (markers.some((m) => m.progress > 0)) return "open" as const;
  return "open" as const;
}

function toneClass(tone: "done" | "awaiting" | "open", selected: boolean) {
  if (selected) {
    return "border-brand bg-brand text-white ring-1 ring-brand/40 ring-offset-1";
  }
  if (tone === "awaiting") {
    return "border-amber-600 bg-amber-500 text-white ring-1 ring-amber-400/50";
  }
  if (tone === "done") {
    return "border-emerald-600 bg-emerald-500 text-white";
  }
  return "border-amber-500 bg-amber-400 text-slate-900";
}

function isLightHex(hex: string) {
  const m = hex.replace("#", "");
  if (m.length !== 6) return false;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 160;
}

function plotColorStyle(color: string, tone: "done" | "awaiting" | "open") {
  const light = isLightHex(color);
  const border =
    tone === "awaiting" ? "#d97706" : tone === "done" ? "#059669" : "#ffffff";
  return {
    backgroundColor: color,
    color: light ? "#0f172a" : "#ffffff",
    borderColor: border,
  };
}

function sharedPlotColor(markers: FloorMapMarker[]): string | null {
  const first = markers[0]?.color;
  if (!first) return null;
  return markers.every((m) => m.color === first) ? first : null;
}

function clusterMarkers(
  markers: FloorMapMarker[],
  contentW: number,
  contentH: number,
  zoom: number
): ClusterItem[] {
  if (contentW <= 0 || contentH <= 0 || markers.length === 0) {
    return markers.map((m) => ({ type: "single", marker: m }));
  }

  const threshold = CLUSTER_BASE_PX / zoom;
  const used = new Set<string>();
  const out: ClusterItem[] = [];

  for (const m of markers) {
    if (used.has(m.id)) continue;
    const px = m.x * contentW;
    const py = m.y * contentH;
    const group: FloorMapMarker[] = [m];
    used.add(m.id);

    for (const other of markers) {
      if (used.has(other.id)) continue;
      const dx = other.x * contentW - px;
      const dy = other.y * contentH - py;
      if (Math.hypot(dx, dy) <= threshold) {
        group.push(other);
        used.add(other.id);
      }
    }

    if (group.length === 1) {
      out.push({ type: "single", marker: group[0] });
    } else {
      const ax = group.reduce((s, g) => s + g.x, 0) / group.length;
      const ay = group.reduce((s, g) => s + g.y, 0) / group.length;
      out.push({
        type: "group",
        id: `c-${group.map((g) => g.id).sort().join("-").slice(0, 48)}`,
        x: ax,
        y: ay,
        markers: group,
      });
    }
  }

  return out;
}

export function FloorMap({
  drawingUrl,
  drawingHiUrl = null,
  floorName,
  markers,
  ghostPoints = [],
  selectedMarkerId,
  showLabels,
  plotMode,
  splitMode,
  onSelectMarker,
  onPlot,
  onGhostClick,
  plotRegion = null,
  regionEdit = false,
  onRegionDraw,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const miniRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
  const [vpSize, setVpSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wantHi, setWantHi] = useState(false);
  const [hiLoaded, setHiLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [clusterMenu, setClusterMenu] = useState<{
    id: string;
    x: number;
    y: number;
    markers: FloorMapMarker[];
  } | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  /** Multi-touch (pinch) */
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map()
  );
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    originContentX: number;
    originContentY: number;
  } | null>(null);
  const didPinchRef = useRef(false);
  const regionDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  const miniDragRef = useRef<{
    pointerId: number;
    /** offset pointer → pojok kiri-atas viewport box (0–1 mini space) */
    grabX: number;
    grabY: number;
  } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) {
        setMapReady(true);
        setVpSize({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [drawingUrl]);

  useEffect(() => {
    setMapLoaded(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setClusterMenu(null);
    setQuery("");
    setWantHi(false);
    setHiLoaded(false);
  }, [drawingUrl]);

  const [moving, setMoving] = useState(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setMoving(true);
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => setMoving(false), SETTLE_MS);
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [pan.x, pan.y, zoom]);

  useEffect(() => {
    if (drawingHiUrl && zoom > HI_RES_ZOOM) setWantHi(true);
  }, [drawingHiUrl, zoom]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      setContentSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mapLoaded, drawingUrl, mapReady]);

  const clampPan = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }) => {
      const vp = viewportRef.current;
      if (!vp || contentSize.w <= 0) return nextPan;
      const vw = vp.clientWidth;
      const vh = vp.clientHeight;
      const cw = contentSize.w * nextZoom;
      const ch = contentSize.h * nextZoom;
      const minX = Math.min(0, vw - cw);
      const minY = Math.min(0, vh - ch);
      return {
        x: Math.min(0, Math.max(minX, nextPan.x)),
        y: Math.min(0, Math.max(minY, nextPan.y)),
      };
    },
    [contentSize.h, contentSize.w]
  );

  /** Geser main view supaya pojok kiri-atas viewport = (leftFrac, topFrac) di content 0–1 */
  const panToContentCorner = useCallback(
    (leftFrac: number, topFrac: number) => {
      const vp = viewportRef.current;
      if (!vp || contentSize.w <= 0) return;
      setPan(
        clampPan(zoom, {
          x: -(leftFrac * contentSize.w) * zoom,
          y: -(topFrac * contentSize.h) * zoom,
        })
      );
    },
    [clampPan, contentSize.h, contentSize.w, zoom]
  );

  const miniViewport = useMemo(() => {
    if (contentSize.w <= 0 || contentSize.h <= 0 || vpSize.w <= 0) {
      return { left: 0, top: 0, width: 1, height: 1 };
    }
    const left = -pan.x / zoom / contentSize.w;
    const top = -pan.y / zoom / contentSize.h;
    const width = vpSize.w / zoom / contentSize.w;
    const height = vpSize.h / zoom / contentSize.h;
    return {
      left: Math.max(0, Math.min(1, left)),
      top: Math.max(0, Math.min(1, top)),
      width: Math.max(0.04, Math.min(1, width)),
      height: Math.max(0.04, Math.min(1, height)),
    };
  }, [contentSize.h, contentSize.w, pan.x, pan.y, vpSize.h, vpSize.w, zoom]);

  const zoomAt = useCallback(
    (nextZoom: number, originX: number, originY: number) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      setZoom((prevZ) => {
        const ratio = z / prevZ;
        setPan((prevPan) =>
          clampPan(z, {
            x: originX - (originX - prevPan.x) * ratio,
            y: originY - (originY - prevPan.y) * ratio,
          })
        );
        return z;
      });
    },
    [clampPan]
  );

  const focusMarker = useCallback(
    (m: FloorMapMarker, targetZoom = 3.2) => {
      const vp = viewportRef.current;
      if (!vp || contentSize.w <= 0) {
        onSelectMarker(m.id);
        return;
      }
      const z = Math.min(MAX_ZOOM, Math.max(zoom, targetZoom));
      const nextPan = clampPan(z, {
        x: vp.clientWidth / 2 - m.x * contentSize.w * z,
        y: vp.clientHeight / 2 - m.y * contentSize.h * z,
      });
      setZoom(z);
      setPan(nextPan);
      setClusterMenu(null);
      onSelectMarker(m.id);
    },
    [clampPan, contentSize.h, contentSize.w, onSelectMarker, zoom]
  );

  const clusters = useMemo(
    () =>
      clusterMarkers(markers, contentSize.w, contentSize.h, zoom),
    [markers, contentSize.w, contentSize.h, zoom]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? markers
      : markers.filter(
          (m) =>
            m.label.toLowerCase().includes(q) ||
            String(m.progress).includes(q)
        );
    return [...list].sort((a, b) =>
      a.label.localeCompare(b.label, "id", { numeric: true })
    );
  }, [markers, query]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (!drawingUrl || !mapLoaded) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((prevZ) => {
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZ * factor));
        const ratio = z / prevZ;
        setPan((prevPan) =>
          clampPan(z, {
            x: ox - (ox - prevPan.x) * ratio,
            y: oy - (oy - prevPan.y) * ratio,
          })
        );
        return z;
      });
    };
    // Blokir gesture browser (pinch-zoom page) biar map yang pegang
    const preventTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    el.addEventListener("touchstart", preventTouch, { passive: false });
    el.addEventListener("touchmove", preventTouch, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheelNative);
      el.removeEventListener("touchstart", preventTouch);
      el.removeEventListener("touchmove", preventTouch);
    };
  }, [drawingUrl, mapLoaded, clampPan]);

  function pointerMidpointViewport() {
    const pts = Array.from(pointersRef.current.values());
    const vp = viewportRef.current;
    if (pts.length < 2 || !vp) return null;
    const rect = vp.getBoundingClientRect();
    return {
      x: (pts[0].x + pts[1].x) / 2 - rect.left,
      y: (pts[0].y + pts[1].y) / 2 - rect.top,
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
    };
  }

  function beginPinch() {
    const mid = pointerMidpointViewport();
    if (!mid || mid.dist < 8) return;
    const z = zoomRef.current;
    const p = panRef.current;
    pinchRef.current = {
      startDist: mid.dist,
      startZoom: z,
      startPanX: p.x,
      startPanY: p.y,
      originContentX: (mid.x - p.x) / z,
      originContentY: (mid.y - p.y) / z,
    };
    dragRef.current = null;
    didPinchRef.current = true;
  }

  function applyPinch() {
    const pinch = pinchRef.current;
    const mid = pointerMidpointViewport();
    if (!pinch || !mid || mid.dist < 8) return;
    const z = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, pinch.startZoom * (mid.dist / pinch.startDist))
    );
    setZoom(z);
    setPan(
      clampPan(z, {
        x: mid.x - pinch.originContentX * z,
        y: mid.y - pinch.originContentY * z,
      })
    );
  }

  function clientToContent(clientX: number, clientY: number) {
    const vp = viewportRef.current;
    if (!vp || contentSize.w <= 0 || contentSize.h <= 0) return null;
    const rect = vp.getBoundingClientRect();
    const z = zoomRef.current;
    const p = panRef.current;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left - p.x) / z / contentSize.w)),
      y: Math.min(1, Math.max(0, (clientY - rect.top - p.y) / z / contentSize.h)),
    };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drawingUrl || !mapLoaded) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    if (regionEdit) {
      const t = e.target;
      if (t instanceof Element && t.closest("[data-mini-map]")) return;
      if (regionDragRef.current) return;
      const pt = clientToContent(e.clientX, e.clientY);
      if (!pt) return;
      regionDragRef.current = {
        pointerId: e.pointerId,
        startX: pt.x,
        startY: pt.y,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    // Jangan ambil gesture kalau klik di marker / cluster / menu
    const t = e.target;
    if (
      t instanceof Element &&
      t.closest(
        "[data-map-marker],[data-map-cluster],[data-cluster-menu],[data-mini-map]"
      )
    ) {
      return;
    }

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }

    didPinchRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      moved: false,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const rd = regionDragRef.current;
    if (rd) {
      if (rd.pointerId !== e.pointerId) return;
      const pt = clientToContent(e.clientX, e.clientY);
      if (pt) {
        onRegionDraw?.(regionFromCorners(rd.startX, rd.startY, pt.x, pt.y));
      }
      return;
    }
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) beginPinch();
      applyPinch();
      return;
    }

    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    if (plotMode) return;
    setPan(clampPan(zoomRef.current, { x: d.panX + dx, y: d.panY + dy }));
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const rd = regionDragRef.current;
    if (rd) {
      if (rd.pointerId !== e.pointerId) return;
      regionDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    pointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }

    if (pointersRef.current.size === 1) {
      // Sisa 1 jari setelah pinch → lanjut pan dari posisi jari itu
      pinchRef.current = null;
      const remaining = Array.from(pointersRef.current.entries())[0];
      if (!remaining) return;
      const [pid, pt] = remaining;
      dragRef.current = {
        pointerId: pid,
        startX: pt.x,
        startY: pt.y,
        panX: panRef.current.x,
        panY: panRef.current.y,
        moved: true,
      };
      return;
    }

    // Semua jari lepas
    const d = dragRef.current;
    const wasDrag = !!d?.moved;
    const wasPinch = didPinchRef.current;
    dragRef.current = null;
    pinchRef.current = null;
    didPinchRef.current = false;

    if (wasDrag || wasPinch) return;

    if (plotMode) {
      const vp = viewportRef.current;
      if (!vp || contentSize.w <= 0) return;
      const rect = vp.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const z = zoomRef.current;
      const p = panRef.current;
      const cx = (vx - p.x) / z;
      const cy = (vy - p.y) / z;
      const x = cx / contentSize.w;
      const y = cy / contentSize.h;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      onPlot(x, y);
      return;
    }

    setClusterMenu(null);
  }

  function zoomBy(factor: number) {
    const vp = viewportRef.current;
    if (!vp) return;
    zoomAt(zoom * factor, vp.clientWidth / 2, vp.clientHeight / 2);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setClusterMenu(null);
  }

  function openCluster(group: {
    id: string;
    x: number;
    y: number;
    markers: FloorMapMarker[];
  }) {
    // Zoom ke cluster; kalau sudah cukup dekat, tampilkan list
    if (zoom < 4) {
      const vp = viewportRef.current;
      if (vp && contentSize.w > 0) {
        const z = Math.min(MAX_ZOOM, Math.max(zoom * 2.2, 3));
        setZoom(z);
        setPan(
          clampPan(z, {
            x: vp.clientWidth / 2 - group.x * contentSize.w * z,
            y: vp.clientHeight / 2 - group.y * contentSize.h * z,
          })
        );
      }
    }
    setClusterMenu(group);
  }

  const imgSrc = drawingUrl
    ? drawingUrl.startsWith("/uploads/")
      ? `/api/uploads/${drawingUrl.slice("/uploads/".length)}`
      : drawingUrl
    : null;

  const showMiniMap = !!imgSrc && mapLoaded && contentSize.w > 0;

  function onMiniPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.preventDefault();
    const mini = miniRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    const inBox =
      nx >= miniViewport.left &&
      nx <= miniViewport.left + miniViewport.width &&
      ny >= miniViewport.top &&
      ny <= miniViewport.top + miniViewport.height;

    if (inBox) {
      miniDragRef.current = {
        pointerId: e.pointerId,
        grabX: nx - miniViewport.left,
        grabY: ny - miniViewport.top,
      };
    } else {
      // Klik di luar kotak → pindahkan viewport ke sini, lalu drag lanjut
      const grabX = miniViewport.width / 2;
      const grabY = miniViewport.height / 2;
      panToContentCorner(nx - grabX, ny - grabY);
      miniDragRef.current = {
        pointerId: e.pointerId,
        grabX,
        grabY,
      };
    }
    mini.setPointerCapture(e.pointerId);
  }

  function onMiniPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = miniDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const mini = miniRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    panToContentCorner(nx - d.grabX, ny - d.grabY);
  }

  function onMiniPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = miniDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    miniDragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col gap-2",
        splitMode && "flex-1"
      )}
    >
      {/* Toolbar map */}
      {drawingUrl && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              placeholder={`Cari titik (${markers.length})…`}
              className="h-8 w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {(query || listOpen) && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700"
                onClick={() => {
                  setQuery("");
                  setListOpen(false);
                }}
                aria-label="Tutup pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {listOpen && (
              <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    Tidak ada titik cocok
                  </p>
                ) : (
                  filtered.slice(0, 80).map((m) => {
                    const tone = markerTone(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          focusMarker(m);
                          setListOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                          selectedMarkerId === m.id && "bg-slate-100"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            !m.color && tone === "done" && "bg-emerald-500",
                            !m.color && tone === "awaiting" && "bg-amber-500",
                            !m.color && tone === "open" && "bg-amber-400"
                          )}
                          style={m.color ? { backgroundColor: m.color } : undefined}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                          {m.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs text-slate-500">
                          {m.progress}%
                        </span>
                      </button>
                    );
                  })
                )}
                {filtered.length > 80 && (
                  <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
                    Menampilkan 80 dari {filtered.length} — ketik lebih spesifik
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 sm:max-w-md sm:flex-none">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 px-0"
              onClick={() => zoomBy(1 / 1.25)}
              title="Zoom out"
              disabled={zoom <= MIN_ZOOM}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(e) => {
                const vp = viewportRef.current;
                if (!vp) return;
                zoomAt(
                  Number(e.target.value),
                  vp.clientWidth / 2,
                  vp.clientHeight / 2
                );
              }}
              className="h-7 min-w-0 flex-1 cursor-pointer accent-brand"
              title="Zoom"
              aria-label="Zoom"
            />
            <span className="w-10 shrink-0 text-center text-xs tabular-nums text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 px-0"
              onClick={() => zoomBy(1.25)}
              title="Zoom in"
              disabled={zoom >= MAX_ZOOM}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 px-0"
              onClick={resetView}
              title="Reset view"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div
        ref={viewportRef}
        className={cn(
          "relative touch-none rounded-xl border border-slate-200 bg-slate-50",
          (plotMode || regionEdit) && "cursor-crosshair ring-2 ring-brand",
          !plotMode &&
            !regionEdit &&
            drawingUrl &&
            mapLoaded &&
            "cursor-grab active:cursor-grabbing",
          drawingUrl && !mapLoaded && "min-h-48",
          splitMode ? "min-h-0 flex-1 overflow-hidden" : "min-h-[20rem] overflow-hidden"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {imgSrc ? (
          mapReady ? (
            <div
              ref={contentRef}
              className={cn(
                "relative origin-top-left",
                moving && "will-change-transform"
              )}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                width: "100%",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imgSrc}
                src={imgSrc}
                alt={floorName}
                className="pointer-events-none block h-auto w-full max-w-full select-none"
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
              {mapLoaded && wantHi && drawingHiUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={drawingHiUrl}
                  src={drawingHiUrl}
                  alt=""
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-0 block h-full w-full select-none transition-opacity duration-200",
                    hiLoaded ? "opacity-100" : "opacity-0"
                  )}
                  draggable={false}
                  decoding="async"
                  onLoad={() => setHiLoaded(true)}
                  onError={() => setHiLoaded(false)}
                />
              )}

              {mapLoaded && plotRegion && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute z-[5] border-2 border-dashed border-sky-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.5)]"
                  style={{
                    left: `${plotRegion.x * 100}%`,
                    top: `${plotRegion.y * 100}%`,
                    width: `${plotRegion.w * 100}%`,
                    height: `${plotRegion.h * 100}%`,
                  }}
                />
              )}

              {mapLoaded &&
                clusters.map((c) => {
                  if (c.type === "single") {
                    const m = c.marker;
                    const selected = selectedMarkerId === m.id;
                    const tone = markerTone(m);
                    const showLabel =
                      showLabels && (zoom >= 1.6 || selected || markers.length < 40);
                    const colored = !!m.color;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-map-marker={m.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          focusMarker(m, Math.max(zoom, 2.5));
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute z-10 shadow transition-transform hover:z-20 hover:scale-125",
                          showLabel
                            ? "max-w-[5.5rem] truncate rounded border px-1 py-px text-[9px] font-semibold leading-tight"
                            : "h-2.5 w-2.5 rounded-full border",
                          colored
                            ? cn(
                                selected &&
                                  "ring-1 ring-brand ring-offset-1",
                                !selected &&
                                  tone === "awaiting" &&
                                  "ring-1 ring-amber-400/70"
                              )
                            : toneClass(tone, selected)
                        )}
                        style={{
                          left: `${m.x * 100}%`,
                          top: `${m.y * 100}%`,
                          transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                          ...(colored ? plotColorStyle(m.color!, tone) : {}),
                        }}
                        title={`${m.label} (${m.progress}%)${
                          m.awaiting ? " · menunggu approval" : ""
                        }`}
                      >
                        {showLabel ? (
                          <>
                            <span className="truncate">{m.label}</span>
                            <span className="ml-0.5 opacity-75">
                              {m.progress}%
                            </span>
                            {m.awaiting && (
                              <span className="ml-0.5 font-bold">!</span>
                            )}
                          </>
                        ) : (
                          <span className="sr-only">
                            {m.label} {m.progress}%
                            {m.awaiting ? " menunggu approval" : ""}
                          </span>
                        )}
                      </button>
                    );
                  }

                  const tone = groupTone(c.markers);
                  const selected = c.markers.some(
                    (m) => m.id === selectedMarkerId
                  );
                  const groupColor = sharedPlotColor(c.markers);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-map-cluster={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCluster(c);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={cn(
                        "absolute z-20 flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold shadow-md hover:z-30",
                        groupColor
                          ? cn(
                              selected &&
                                "ring-1 ring-brand ring-offset-1"
                            )
                          : toneClass(tone, selected)
                      )}
                      style={{
                        left: `${c.x * 100}%`,
                        top: `${c.y * 100}%`,
                        transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                        ...(groupColor ? plotColorStyle(groupColor, tone) : {}),
                      }}
                      title={`${c.markers.length} titik — klik untuk zoom / pilih`}
                    >
                      {c.markers.length}
                    </button>
                  );
                })}

              {mapLoaded &&
                ghostPoints.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGhostClick?.(g.id);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute z-30 h-3 w-3 rounded-full border-2 shadow",
                      g.selected
                        ? "ring-2 ring-brand ring-offset-1"
                        : "opacity-70"
                    )}
                    style={{
                      left: `${g.x * 100}%`,
                      top: `${g.y * 100}%`,
                      backgroundColor: g.color || "#f59e0b",
                      borderColor: g.selected ? "#0f172a" : "white",
                      transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                    }}
                    title={g.label || "Titik terdeteksi"}
                  />
                ))}

              {clusterMenu && (
                <div
                  data-cluster-menu
                  className="absolute z-40 w-44 -translate-x-1/2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
                  style={{
                    left: `${clusterMenu.x * 100}%`,
                    top: `${clusterMenu.y * 100}%`,
                    transform: `translate(-50%, 8px) scale(${1 / zoom})`,
                    transformOrigin: "top center",
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">
                      {clusterMenu.markers.length} titik
                    </p>
                    <button
                      type="button"
                      className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                      onClick={() => setClusterMenu(null)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <ul className="max-h-40 overflow-auto py-0.5">
                    {[...clusterMenu.markers]
                      .sort((a, b) =>
                        a.label.localeCompare(b.label, "id", { numeric: true })
                      )
                      .map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] hover:bg-slate-50"
                            onClick={() => focusMarker(m, Math.max(zoom, 4))}
                          >
                            {m.color && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full border border-slate-200"
                                style={{ backgroundColor: m.color }}
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                              {m.label}
                            </span>
                            <span className="tabular-nums text-slate-500">
                              {m.progress}%
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
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

        {drawingUrl && mapLoaded && (
          <p className="pointer-events-none absolute bottom-2 left-2 z-20 rounded bg-white/85 px-2 py-1 text-[10px] text-slate-500 shadow-sm backdrop-blur-sm">
            Pinch / scroll zoom · drag geser
            {plotMode ? " · tap untuk plot" : ""}
            {regionEdit ? " · drag untuk menggambar area plot" : ""}
          </p>
        )}

        {showMiniMap && imgSrc && (
          <div
            ref={miniRef}
            data-mini-map
            className="absolute bottom-2 right-2 z-30 w-[7.5rem] cursor-crosshair overflow-hidden rounded-lg border border-slate-300 bg-slate-100 shadow-lg sm:w-36"
            style={{
              aspectRatio:
                contentSize.w > 0 && contentSize.h > 0
                  ? `${contentSize.w} / ${contentSize.h}`
                  : "1 / 1",
            }}
            title="Mini-map — klik atau geser kotak untuk pindah view"
            onPointerDown={onMiniPointerDown}
            onPointerMove={onMiniPointerMove}
            onPointerUp={onMiniPointerUp}
            onPointerCancel={onMiniPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full object-fill select-none"
              draggable={false}
            />
            {/* Marker dots tipis di mini-map (max ~60 biar ringan) */}
            {markers.slice(0, 60).map((m) => (
              <span
                key={m.id}
                className={cn(
                  "pointer-events-none absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  m.id === selectedMarkerId
                    ? "bg-brand ring-1 ring-white"
                    : m.progress >= 100
                      ? "bg-emerald-500"
                      : "bg-amber-500"
                )}
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
              />
            ))}
            <div
              className="absolute box-border border-2 border-sky-500 bg-sky-400/20 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
              style={{
                left: `${miniViewport.left * 100}%`,
                top: `${miniViewport.top * 100}%`,
                width: `${miniViewport.width * 100}%`,
                height: `${miniViewport.height * 100}%`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
