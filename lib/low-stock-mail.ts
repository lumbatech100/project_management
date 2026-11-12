import nodemailer from "nodemailer";
import { formatFromHeader, resolveMailSenders } from "./mail-senders";
import { isLowStock, lowStockItems } from "./inventory";
import { prisma } from "./prisma";

export async function lowStockIdSet(projectId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { projectId, minQty: { not: null } },
    select: { id: true, qty: true, minQty: true },
  });
  return new Set(items.filter(isLowStock).map((i) => i.id));
}

/**
 * Satu email ke member internal (Admin, PM, SM/HSE) berisi semua barang
 * yang sedang di bawah minimum, hanya jika ada barang yang baru menyeberang batas.
 */
export async function notifyIfNewLowStock(projectId: string, before: Set<string>) {
  try {
    const items = await lowStockItems(projectId);
    if (!items.some((i) => !before.has(i.id))) return;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPass: true,
        mailFrom: true,
        mailFromName: true,
        mailSenders: true,
      },
    });
    const from = project ? resolveMailSenders(project)[0] : undefined;
    if (!project?.smtpHost || !from) return;

    const members = await prisma.projectMember.findMany({
      where: {
        projectId,
        user: { role: { in: ["ADMIN", "PM", "SM"] } },
      },
      select: { user: { select: { email: true } } },
    });
    const to = [...new Set(members.map((m) => m.user.email).filter(Boolean))];
    if (!to.length) return;

    const rows = items
      .map(
        (i) =>
          `<tr><td style="padding:6px 8px;border:1px solid #e2e8f0">${escape(i.name)}</td>` +
          `<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${i.qty} ${escape(i.unit)}</td>` +
          `<td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right">${i.minQty} ${escape(i.unit)}</td></tr>`
      )
      .join("");
    const text = items
      .map((i) => `- ${i.name}: stok ${i.qty} ${i.unit}, minimum ${i.minQty} ${i.unit}`)
      .join("\n");

    const transporter = nodemailer.createTransport({
      host: project.smtpHost,
      port: project.smtpPort ?? 587,
      secure: project.smtpSecure,
      auth:
        project.smtpUser && project.smtpPass
          ? { user: project.smtpUser, pass: project.smtpPass }
          : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    await transporter.sendMail({
      from: formatFromHeader(from),
      to: to.join(", "),
      subject: `[Simplo] Stok di bawah minimum — ${project.name}`,
      text: `Barang berikut di ${project.name} berada di bawah stok minimum:\n\n${text}`,
      html: `<p>Barang berikut di <strong>${escape(project.name)}</strong> berada di bawah stok minimum.</p>
<table style="border-collapse:collapse;font-size:13px">
<thead><tr>
<th style="padding:6px 8px;border:1px solid #e2e8f0;text-align:left">Barang</th>
<th style="padding:6px 8px;border:1px solid #e2e8f0">Stok saat ini</th>
<th style="padding:6px 8px;border:1px solid #e2e8f0">Minimum</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>`,
    });
  } catch (err) {
    console.error("low-stock email", err);
  }
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
