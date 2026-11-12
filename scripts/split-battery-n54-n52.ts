import { prisma } from "@/lib/prisma";
import { syncPoInventoryItems } from "@/lib/inventory";

const BATTERY_UNIT_PRICE = 225000; // sama seperti B127AH yang sudah ada
const BATTERY_CODE = "B127AH";
const BATTERY_NOTES = "Battery 12 V-6 AH";

const PROJECT_NAMES = ["DCI JK07", "JK07 Data Center Indonesia"];
const PO_NUMBER = "PO-JK7-ACS";

type ControllerSpec = {
  oldName: string;
  newName: string;
  shortName: string; // e.g. EP.N5400
  batteryName: string; // B127AH (Battery for EP.N5400)
};

const controllers: ControllerSpec[] = [
  {
    oldName: "EP.N5400.PSU + Battery",
    newName: "EP.N5400.PSU",
    shortName: "EP.N5400",
    batteryName: "B127AH (Battery for EP.N5400)",
  },
  {
    oldName: "EP.N5200.PSU + Battery",
    newName: "EP.N5200.PSU",
    shortName: "EP.N5200",
    batteryName: "B127AH (Battery for EP.N5200)",
  },
];

async function processProject(projectName: string) {
  const project = await prisma.project.findFirst({
    where: { name: projectName },
    select: { id: true, name: true },
  });
  if (!project) throw new Error(`Project not found: ${projectName}`);

  const po = await prisma.purchaseOrder.findFirst({
    where: { projectId: project.id, number: PO_NUMBER },
    include: { lines: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
  if (!po) throw new Error(`PO not found for ${projectName}`);

  // Baterai B127AH yang sudah ada (stok bersama) di project ini
  const existingBattery = await prisma.inventoryItem.findFirst({
    where: { projectId: project.id, name: "B127AH" },
    select: { id: true },
  });
  if (!existingBattery) throw new Error(`InventoryItem B127AH not found for ${projectName}`);

  type PlannedNewLine = {
    afterLineId: string;
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    bobotPct: number;
    bobotUnitPct: number;
  };
  const newLines: PlannedNewLine[] = [];
  const controllerUpdates: {
    id: string;
    name: string;
    unitPrice: number;
    amount: number;
    bobotPct: number;
    bobotUnitPct: number;
    inventoryItemId: string | null;
  }[] = [];

  for (const spec of controllers) {
    const line = po.lines.find((l) => l.name === spec.oldName);
    if (!line) throw new Error(`Line not found: ${spec.oldName} in ${projectName}`);
    const qty = line.qty;
    const oldUnitPrice = line.unitPrice!;
    const oldAmount = line.amount!;
    const oldBobotPct = line.bobotPct;
    const oldBobotUnitPct = line.bobotUnitPct ?? oldBobotPct / qty;

    const batteryAmount = BATTERY_UNIT_PRICE * qty;
    const newUnitPrice = oldUnitPrice - BATTERY_UNIT_PRICE;
    const newAmount = oldAmount - batteryAmount;
    const batteryBobotPct = oldBobotPct * (batteryAmount / oldAmount);
    const newControllerBobotPct = oldBobotPct - batteryBobotPct;
    const batteryBobotUnitPct = oldBobotUnitPct * (batteryAmount / oldAmount);
    const newControllerBobotUnitPct = oldBobotUnitPct - batteryBobotUnitPct;

    controllerUpdates.push({
      id: line.id,
      name: spec.newName,
      unitPrice: newUnitPrice,
      amount: newAmount,
      bobotPct: newControllerBobotPct,
      bobotUnitPct: newControllerBobotUnitPct,
      inventoryItemId: line.inventoryItemId,
    });

    newLines.push({
      afterLineId: line.id,
      name: spec.batteryName,
      qty,
      unitPrice: BATTERY_UNIT_PRICE,
      amount: batteryAmount,
      bobotPct: batteryBobotPct,
      bobotUnitPct: batteryBobotUnitPct,
    });
  }

  // Build final ordering: walk existing lines in order, inserting the new
  // battery line immediately after its controller line.
  const finalOrder: { id?: string; isNew?: PlannedNewLine }[] = [];
  for (const l of po.lines) {
    finalOrder.push({ id: l.id });
    const nl = newLines.find((n) => n.afterLineId === l.id);
    if (nl) finalOrder.push({ isNew: nl });
  }

  console.log(`\n=== ${projectName}: applying ===`);
  await prisma.$transaction(async (tx) => {
    // 1) Shift sortOrder for all existing lines according to final order.
    for (const [idx, entry] of finalOrder.entries()) {
      if (entry.id) {
        await tx.poLine.update({ where: { id: entry.id }, data: { sortOrder: idx } });
      }
    }
    // 2) Apply controller renames/price/bobot updates.
    for (const u of controllerUpdates) {
      await tx.poLine.update({
        where: { id: u.id },
        data: {
          name: u.name,
          unitPrice: u.unitPrice,
          amount: u.amount,
          bobotPct: u.bobotPct,
          bobotUnitPct: u.bobotUnitPct,
        },
      });
      if (u.inventoryItemId) {
        await tx.inventoryItem.update({
          where: { id: u.inventoryItemId },
          data: { name: u.name },
        });
      }
    }
    // 3) Create the new battery lines, merged into existing B127AH stock.
    for (const [idx, entry] of finalOrder.entries()) {
      if (entry.isNew) {
        const nl = entry.isNew;
        await tx.poLine.create({
          data: {
            poId: po.id,
            name: nl.name,
            code: BATTERY_CODE,
            groupName: "A Perangkat",
            type: "BARANG",
            qty: nl.qty,
            unit: "Unit",
            unitPrice: nl.unitPrice,
            amount: nl.amount,
            bobotPct: nl.bobotPct,
            bobotUnitPct: nl.bobotUnitPct,
            sortOrder: idx,
            progressPct: 0,
            notes: BATTERY_NOTES,
            inventoryItemId: existingBattery.id,
          },
        });
      }
    }
  });

  await syncPoInventoryItems(project.id);
  console.log(`Done: ${projectName}`);
}

async function main() {
  for (const name of PROJECT_NAMES) {
    await processProject(name);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
