import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";
import { getProjectProgress } from "@/lib/project-progress";
import { getAttendanceAccess, hasAttendanceAccess } from "@/lib/attendance";
import { collectProjectUploadUrls, deleteUploads } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

async function verifyPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return compare(password, user.password);
}

export async function GET(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;

  if (req.nextUrl.searchParams.get("view") === "summary") {
    const [summary, progress] = await Promise.all([
      prisma.project.findUnique({
        where: { id: params.id },
        select: { id: true, name: true },
      }),
      getProjectProgress(params.id),
    ]);
    if (!summary) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const absen = await getAttendanceAccess(session.user, params.id);
    return NextResponse.json({
      id: summary.id,
      name: summary.name,
      progress,
      absenAccess: hasAttendanceAccess(absen),
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      floors: {
        orderBy: { createdAt: "asc" },
        include: {
          markers: {
            include: {
              items: {
                orderBy: { name: "asc" },
                // Hanya kolom yang dipakai aplikasi (payload ~25% lebih kecil)
                select: {
                  id: true,
                  markerId: true,
                  name: true,
                  bobot: true,
                  sortOrder: true,
                  status: true,
                  done: true,
                  progressPct: true,
                  submittedPct: true,
                  submittedAt: true,
                  submittedBy: true,
                  approvedAt: true,
                  approvedBy: true,
                  photoUrls: true,
                },
              },
            },
          },
        },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { smtpPass, smtpUser, ...safeProject } = project;
  void smtpPass;
  void smtpUser;
  const absen = await getAttendanceAccess(session.user, params.id);
  return NextResponse.json({
    ...safeProject,
    absenAccess: hasAttendanceAccess(absen),
  });
}

export async function PUT(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.project.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nama project wajib" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : null;
  const status =
    body.status === "completed" || body.status === "active"
      ? body.status
      : existing.status;

  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      name,
      description: description || null,
      status,
    },
  });

  return NextResponse.json(project);
}

export async function DELETE(req: NextRequest, props: Params) {
  const params = await props.params;
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const denied = await forbidUnlessProjectAccess(
    session.user.id,
    session.user.role,
    params.id
  );
  if (denied) return denied;
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const confirmName =
    typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!confirmName) {
    return NextResponse.json(
      { error: "Ketik nama project untuk konfirmasi" },
      { status: 400 }
    );
  }
  if (confirmName !== project.name) {
    return NextResponse.json(
      { error: "Nama project tidak cocok" },
      { status: 400 }
    );
  }
  if (!password) {
    return NextResponse.json({ error: "Password wajib diisi" }, { status: 400 });
  }

  const ok = await verifyPassword(session.user.id, password);
  if (!ok) {
    return NextResponse.json({ error: "Password salah" }, { status: 403 });
  }

  // Kumpulkan dulu semua URL file project ini (drawing, foto, dokumen, nota, dll)
  // sebelum row-nya dihapus, supaya filenya bisa dibersihkan dari disk sesudahnya.
  const uploadUrls = await collectProjectUploadUrls(params.id);

  try {
    // CostItem.category dan DeliveryNoteLine.item pakai onDelete: Restrict,
    // sementara Project cascade langsung ke CostCategory/InventoryItem secara
    // paralel — kalau dibiarkan ke cascade DB, urutan eksekusinya tidak
    // dijamin dan bisa melempar FK violation saat hapus project yang sudah
    // punya cost/inventory. Hapus dulu baris "Restrict" ini secara eksplisit
    // dalam satu transaksi atomic sebelum project dihapus.
    await prisma.$transaction([
      prisma.costItem.deleteMany({ where: { projectId: params.id } }),
      prisma.deliveryNoteLine.deleteMany({
        where: { deliveryNote: { projectId: params.id } },
      }),
      prisma.project.delete({ where: { id: params.id } }),
    ]);
  } catch (err) {
    console.error("[project delete] failed", err);
    return NextResponse.json(
      { error: "Gagal menghapus project. Coba lagi." },
      { status: 500 }
    );
  }

  // Best-effort: bersihkan file fisik setelah DB sukses dihapus. Kegagalan di
  // sini tidak dilaporkan ke client karena project sudah terhapus dari DB.
  await deleteUploads(uploadUrls);

  return NextResponse.json({ ok: true });
}
