import { prisma } from "@/lib/prisma";
import type { MenuKey } from "@/lib/menus";

export type UploadOwner = {
  projectId: string;
  /** Menu fitur yang wajib dimiliki untuk membuka file (salah satu, selain membership). */
  menu: MenuKey | MenuKey[] | null;
};

/**
 * Cari project pemilik file upload dari record yang mereferensikannya.
 * File tanpa pemilik (yatim) mengembalikan null → ditolak untuk non-Admin.
 */
export async function findUploadOwner(
  filename: string
): Promise<UploadOwner | null> {
  const urls = [`/api/uploads/${filename}`, `/uploads/${filename}`];

  const doc = await prisma.projectDocument.findFirst({
    where: { fileUrl: { in: urls } },
    select: { projectId: true },
  });
  if (doc) return { projectId: doc.projectId, menu: "project.dokumen" };

  const cost = await prisma.costItem.findFirst({
    where: { receiptUrl: { in: urls } },
    select: { projectId: true },
  });
  if (cost) return { projectId: cost.projectId, menu: "project.cost" };

  const worker = await prisma.worker.findFirst({
    where: {
      OR: [{ photoKtpUrl: { in: urls } }, { photoSelfieUrl: { in: urls } }],
    },
    select: { projectId: true },
  });
  if (worker) return { projectId: worker.projectId, menu: "project.pekerja" };

  const floor = await prisma.floor.findFirst({
    where: {
      OR: [{ drawingUrl: { in: urls } }, { drawingHiUrl: { in: urls } }],
    },
    select: { projectId: true },
  });
  if (floor) return { projectId: floor.projectId, menu: null };

  const project = await prisma.project.findFirst({
    where: { timelinePdfUrl: { in: urls } },
    select: { id: true },
  });
  if (project) return { projectId: project.id, menu: null };

  const item = await prisma.breakdownItem.findFirst({
    where: { photoUrls: { hasSome: urls } },
    select: { marker: { select: { floor: { select: { projectId: true } } } } },
  });
  if (item) return { projectId: item.marker.floor.projectId, menu: null };

  const markerReport = await prisma.markerDailyReport.findFirst({
    where: { blockerPhotos: { hasSome: urls } },
    select: { dailyReport: { select: { projectId: true } } },
  });
  if (markerReport) {
    return { projectId: markerReport.dailyReport.projectId, menu: null };
  }

  const note = await prisma.deliveryNote.findFirst({
    where: { photoUrls: { hasSome: urls } },
    select: { projectId: true },
  });
  if (note) {
    return { projectId: note.projectId, menu: ["project.inventory", "project.po"] };
  }

  const delivery = await prisma.poDelivery.findFirst({
    where: { photoUrls: { hasSome: urls } },
    select: { line: { select: { po: { select: { projectId: true } } } } },
  });
  if (delivery) {
    return { projectId: delivery.line.po.projectId, menu: "project.po" };
  }

  const sheet = await prisma.attendanceSheet.findFirst({
    where: { photoUrls: { hasSome: urls } },
    select: { projectId: true },
  });
  if (sheet) return { projectId: sheet.projectId, menu: null };

  const receipt = await prisma.goodsReceipt.findFirst({
    where: { attachmentUrls: { hasSome: urls } },
    select: { projectId: true },
  });
  if (receipt) return { projectId: receipt.projectId, menu: "project.inventory" };

  return null;
}
