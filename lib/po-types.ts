import type { PoLineType } from "@prisma/client";

export const PO_LINE_TYPES: PoLineType[] = [
  "BARANG",
  "JASA_INSTALASI",
  "JASA_MILESTONE",
];

export const PO_LINE_TYPE_LABELS: Record<PoLineType, string> = {
  BARANG: "Barang (delivery)",
  JASA_INSTALASI: "Jasa instalasi",
  JASA_MILESTONE: "Jasa milestone",
};

export function poLineTypeLabel(type: PoLineType | string) {
  return (
    PO_LINE_TYPE_LABELS[type as PoLineType] || String(type)
  );
}
