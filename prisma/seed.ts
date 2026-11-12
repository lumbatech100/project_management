import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { defaultMenusForRole } from "../lib/menus";

const prisma = new PrismaClient();

async function main() {
  const fromEnv = process.env.SEED_PASSWORD?.trim();
  if (fromEnv && fromEnv.length < 8) {
    throw new Error("SEED_PASSWORD minimal 8 karakter");
  }
  const plain = fromEnv || randomBytes(12).toString("base64url");
  const password = await hash(plain, 10);

  const users: { name: string; email: string; role: Role }[] = [
    { name: "Admin Simplo", email: "admin@simplo.id", role: "ADMIN" },
    { name: "Project Manager", email: "pm@lumbatech.com", role: "PM" },
    { name: "Site Manager", email: "sm1@lumbatech.com", role: "SM" },
    { name: "HSE 1", email: "hse1@lumbatech.com", role: "SM" },
    { name: "HSE 2", email: "hse2@lumbatech.com", role: "SM" },
    { name: "Client Demo", email: "client@simplo.id", role: "CLIENT" },
  ];

  for (const u of users) {
    const menus = defaultMenusForRole(u.role);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        menus,
      },
    });
  }

  console.log(
    fromEnv
      ? "Seed OK — login: admin@simplo.id / (SEED_PASSWORD)"
      : `Seed OK — login: admin@simplo.id / ${plain}  (simpan, tidak ditampilkan lagi)`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
