import { PrismaClient } from "@prisma/client";
import { defaultMenusForRole } from "../lib/menus";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const menus = u.menus?.length ? u.menus : defaultMenusForRole(u.role);
    await prisma.user.update({ where: { id: u.id }, data: { menus } });
    console.log(u.email, menus.length, "menus");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
