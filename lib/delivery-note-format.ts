export type SuratJalanPrintNote = {
  number: string;
  direction: "IN" | "OUT";
  destination?: "SITE" | "OFFICE" | null;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  date: string | Date;
  partyName?: string | null;
  vehicleNo?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  confirmedBy?: string | null;
  lines: {
    itemId: string;
    quantity: number;
    notes?: string | null;
    item?: {
      id: string;
      name: string;
      unit: string;
      code?: string | null;
    };
  }[];
};

import { lumbatechLetterheadHtml } from "./letterhead";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIdDate(v: string | Date) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function buildSuratJalanHtml(opts: {
  projectName: string;
  note: SuratJalanPrintNote;
}): string {
  const { projectName, note } = opts;
  const arah = note.direction === "IN" ? "MASUK" : "KELUAR";
  const destLabel =
    note.destination === "SITE"
      ? "Site"
      : note.destination === "OFFICE"
        ? "Retur ke office"
        : null;
  const partyLabel =
    note.direction === "IN"
      ? "Diterima dari (supplier)"
      : "Detail tujuan";
  const statusLabel =
    note.status === "CONFIRMED"
      ? "Confirmed"
      : note.status === "DRAFT"
        ? "Draft"
        : "Dibatalkan";

  const rows = note.lines
    .map((l, i) => {
      const name = l.item?.name || l.itemId;
      const code = l.item?.code ? ` (${escapeHtml(l.item.code)})` : "";
      const unit = l.item?.unit || "";
      return `<tr>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center">${i + 1}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1">${escapeHtml(name)}${code}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center">${l.quantity}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1;text-align:center">${escapeHtml(unit)}</td>
        <td style="padding:8px 10px;border:1px solid #cbd5e1">${escapeHtml(l.notes || "")}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Surat Jalan ${escapeHtml(note.number)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Roboto, Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; }
    .sheet { max-width: 800px; margin: 0 auto; }
    @media print {
      .no-print { display: none !important; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    ${lumbatechLetterheadHtml(`Surat Jalan · ${projectName}`)}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px">
      <div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">Surat Jalan Barang ${arah}</div>
        <div style="font-size:13px;color:#64748b;margin-top:2px">${escapeHtml(projectName)}${destLabel ? ` — ${destLabel}` : ""}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#64748b">No. Surat</div>
        <div style="font-size:18px;font-weight:700">${escapeHtml(note.number)}</div>
        <div style="font-size:12px;margin-top:4px;color:#64748b">Status: ${statusLabel}</div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:18px">
      <tr>
        <td style="padding:4px 0;width:140px;color:#64748b">Tanggal</td>
        <td style="padding:4px 0;font-weight:600">${escapeHtml(formatIdDate(note.date))}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#64748b">Jenis</td>
        <td style="padding:4px 0;font-weight:600">Barang ${arah} → Gudang Utama${destLabel ? ` → ${destLabel}` : ""}</td>
      </tr>
      ${
        destLabel
          ? `<tr>
        <td style="padding:4px 0;color:#64748b">Tujuan</td>
        <td style="padding:4px 0;font-weight:600">${destLabel}</td>
      </tr>`
          : ""
      }
      <tr>
        <td style="padding:4px 0;color:#64748b">${partyLabel}</td>
        <td style="padding:4px 0;font-weight:600">${escapeHtml(note.partyName || "—")}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#64748b">No. Kendaraan</td>
        <td style="padding:4px 0;font-weight:600">${escapeHtml(note.vehicleNo || "—")}</td>
      </tr>
      ${
        note.notes
          ? `<tr>
        <td style="padding:4px 0;color:#64748b;vertical-align:top">Keterangan</td>
        <td style="padding:4px 0">${escapeHtml(note.notes)}</td>
      </tr>`
          : ""
      }
    </table>

    <div style="font-size:13px;font-weight:700;margin:0 0 8px">Rincian Barang</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 10px;border:1px solid #cbd5e1;width:40px">No</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:left">Nama barang</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;width:80px">Qty</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;width:70px">Satuan</th>
          <th style="padding:8px 10px;border:1px solid #cbd5e1;text-align:left">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="5" style="padding:12px;border:1px solid #cbd5e1;text-align:center;color:#94a3b8">Tidak ada baris</td></tr>`
        }
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">
      <tr>
        <td style="width:33%;text-align:center;vertical-align:top;padding:8px">
          <div style="font-weight:600;margin-bottom:56px">Pengirim</div>
          <div style="border-top:1px solid #94a3b8;margin:0 24px;padding-top:6px">Nama / Tanda tangan</div>
        </td>
        <td style="width:33%;text-align:center;vertical-align:top;padding:8px">
          <div style="font-weight:600;margin-bottom:56px">Penerima</div>
          <div style="border-top:1px solid #94a3b8;margin:0 24px;padding-top:6px">Nama / Tanda tangan</div>
        </td>
        <td style="width:33%;text-align:center;vertical-align:top;padding:8px">
          <div style="font-weight:600;margin-bottom:56px">Mengetahui</div>
          <div style="border-top:1px solid #94a3b8;margin:0 24px;padding-top:6px">Site Manager / PM</div>
        </td>
      </tr>
    </table>

    <p style="margin-top:28px;font-size:11px;color:#94a3b8">
      Dicetak dari Simplo PMS${note.createdBy ? ` · Dibuat oleh ${escapeHtml(note.createdBy)}` : ""}${note.confirmedBy ? ` · Dikonfirmasi ${escapeHtml(note.confirmedBy)}` : ""}
    </p>
  </div>
</body>
</html>`;
}
