import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, isLowStock, poStatsByItem, stockCard } from "@/lib/inventory";
import { loadInventoryPage } from "@/lib/inventory-page";
import { PrintButton } from "@/components/project/inventory/shared";

function fmtDate(d: Date) {
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtQty(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default async function KartuStokPage(props: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const params = await props.params;
  const { project } = await loadInventoryPage(params.id);

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.itemId, projectId: params.id },
  });
  if (!item) notFound();

  const [card, stats] = await Promise.all([
    stockCard(item.id, item.qty),
    poStatsByItem(prisma, params.id, [item.id]),
  ]);
  const po = stats.get(item.id);
  const totalIn = card.rows.reduce((s, r) => s + r.inQty, 0);
  const totalOut = card.rows.reduce((s, r) => s + r.outQty, 0);
  const low = isLowStock(item);

  const details: [string, string][] = [
    ["Kategori", CATEGORY_LABEL[item.category]],
    ["Kode", item.code || "—"],
    ["Satuan", item.unit],
    ["Lokasi", item.location || "Gudang Utama"],
    ["Stok minimum", item.minQty != null ? `${fmtQty(item.minQty)} ${item.unit}` : "—"],
  ];
  if (po) {
    details.push(
      ["Qty PO", `${fmtQty(po.poQty)} ${item.unit}${po.lines.length > 1 ? ` (${po.lines.map((l) => fmtQty(l.qty)).join(" + ")})` : ""}`],
      ["Kumulatif diterima (MOS)", `${fmtQty(po.received)} ${item.unit}`]
    );
  }
  if (item.notes) details.push(["Catatan", item.notes]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link
          href={`/project/${params.id}/inventory/stok`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Rekap stok
        </Link>
        <PrintButton />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Kartu stok · {project.name}
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">{item.name}</h1>
      </div>

      <div className="grid gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 sm:block">
            <p className="text-slate-500">{label}</p>
            <p className="font-medium text-slate-900 sm:mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Tanggal</th>
              <th className="px-3 py-2.5 font-medium">No. SJ</th>
              <th className="px-3 py-2.5 font-medium">Keterangan</th>
              <th className="px-3 py-2.5 text-right font-medium">Masuk</th>
              <th className="px-3 py-2.5 text-right font-medium">Keluar</th>
              <th className="px-4 py-2.5 text-right font-medium">Sisa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Math.abs(card.opening) > 1e-9 && (
              <tr className="text-slate-500">
                <td className="px-4 py-2">—</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2">Saldo awal / penyesuaian</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-4 py-2 text-right tabular-nums">{fmtQty(card.opening)}</td>
              </tr>
            )}
            {card.rows.length === 0 && Math.abs(card.opening) <= 1e-9 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  Belum ada transaksi masuk/keluar.
                </td>
              </tr>
            )}
            {card.rows.map((r, idx) => (
              <tr key={`${r.noteId}-${idx}`}>
                <td className="whitespace-nowrap px-4 py-2">{fmtDate(r.date)}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                  {r.number}
                </td>
                <td className="px-3 py-2 text-slate-600">{r.description}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {r.inQty ? fmtQty(r.inQty) : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-sky-700">
                  {r.outQty ? fmtQty(r.outQty) : ""}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{fmtQty(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <tr>
              <td className="px-4 py-3" colSpan={3}>
                Sisa stok
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                {fmtQty(totalIn)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-sky-700">
                {fmtQty(totalOut)}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right text-base tabular-nums",
                  low ? "text-amber-700" : "text-slate-900"
                )}
              >
                {fmtQty(card.closing)} {item.unit}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {low && (
        <p className="text-sm text-amber-700">
          Stok di bawah minimum ({fmtQty(item.minQty ?? 0)} {item.unit}).
        </p>
      )}
    </div>
  );
}
