import { PrismaClient } from "@prisma/client";
import { normalizeMenus } from "../lib/menus";

const prisma = new PrismaClient();

/** Beri menu Pending Approval ke user yang berhak approve (SM/Admin). */
async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SM"] } },
  });

  for (const u of users) {
    const current = normalizeMenus(u.menus, u.role);
    if (current.includes("project.approval")) {
      console.log(`${u.email} — sudah punya, skip`);
      continue;
    }
    const menus = [...current, "project.approval" as const];
    await prisma.user.update({ where: { id: u.id }, data: { menus } });
    console.log(`${u.email} (${u.role}) — menu Pending Approval ditambahkan`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
