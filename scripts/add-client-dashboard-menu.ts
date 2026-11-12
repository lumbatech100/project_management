import { PrismaClient } from "@prisma/client";
import { defaultMenusForRole, normalizeMenus } from "../lib/menus";

const prisma = new PrismaClient();

/** Tambah Dashboard + Overview ke user CLIENT yang sudah ada. */
async function main() {
  const users = await prisma.user.findMany({
    where: { role: "CLIENT" },
  });

  for (const u of users) {
    const current = normalizeMenus(u.menus, u.role);
    const extras = defaultMenusForRole("CLIENT").filter(
      (k) => !current.includes(k)
    );
    if (extras.length === 0) {
      console.log(`${u.email} — sudah lengkap`);
      continue;
    }
    const menus = [...current, ...extras];
    await prisma.user.update({ where: { id: u.id }, data: { menus } });
    console.log(`${u.email} — ditambah: ${extras.join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
