import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { defaultMenusForRole } from "../lib/menus";

const prisma = new PrismaClient();

async function main() {
  const password = await hash("Password1", 10);

  const users: { name: string; email: string; role: Role }[] = [
    { name: "Admin Simplo", email: "admin@simplo.id", role: "ADMIN" },
    { name: "Project Manager", email: "pm@simplo.id", role: "PM" },
    { name: "Site Manager", email: "sm@simplo.id", role: "SM" },
    { name: "Leader Tim", email: "leader@simplo.id", role: "LEADER" },
  ];

  for (const u of users) {
    const menus = defaultMenusForRole(u.role);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password, menus, role: u.role },
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        menus,
      },
    });
  }

  console.log("Seed OK — login: admin@simplo.id / Password1");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
