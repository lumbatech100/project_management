import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { forbidUnlessProjectAccess, forbidUnlessMenu } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { canRecordExpense } from "@/lib/utils";
import { deleteUploadByUrl, saveEvidencePhoto } from "@/lib/storage";
import { ensureCostCategories } from "@/lib/cost-categories";

type Params = { params: Promise<{ id: string }> };

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
  const noMenu = forbidUnlessMenu(session.user, "project.cost");
  if (noMenu) return noMenu;

  const categoryId = req.nextUrl.searchParams.get("categoryId");

  const items = await prisma.costItem.findMany({
    where: {
      projectId: params.id,
      ...(categoryId ? { categoryId } : {}),
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest, props: Params) {
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
  if (!canRecordExpense(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ensureCostCategories(params.id);

  let categoryId: string;
  let amount: number;
  let dateStr: string;
  let note: string | null = null;
  let file: File | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Upload tidak valid" }, { status: 400 });
    }
    categoryId = String(form.get("categoryId") || form.get("category") || "");
    amount = parseFloat(String(form.get("amount") || ""));
    dateStr = String(form.get("date") || "");
    const n = String(form.get("note") || "").trim();
    note = n || null;
    const f = form.get("receipt");
    file = f instanceof File && f.size > 0 ? f : null;
  } else {
    const body = await req.json();
    categoryId = String(body.categoryId || body.category || "");
    amount = parseFloat(body.amount);
    dateStr = body.date || "";
    note = body.description?.trim() || body.note?.trim() || null;
  }

  if (!categoryId || Number.isNaN(amount) || amount < 0) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const cat = await prisma.costCategory.findFirst({
    where: { id: categoryId, projectId: params.id, active: true },
  });
  if (!cat) {
    return NextResponse.json({ error: "Kategori tidak ditemukan" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json(
      { error: "Bukti pembayaran wajib (bon / transfer)" },
      { status: 400 }
    );
  }

  let receiptUrl: string;
  try {
    const saved = await saveEvidencePhoto(file, `cost-${params.id}`);
    receiptUrl = saved.url;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Gagal upload bukti",
      },
      { status: 400 }
    );
  }

  const date = dateStr ? new Date(dateStr) : new Date();
  const dateLabel = Number.isNaN(date.getTime()) ? new Date() : date;
  const name = note
    ? note.slice(0, 120)
    : `${cat.name} · ${dateLabel.toLocaleDateString("id-ID")}`;

  try {
    const item = await prisma.costItem.create({
      data: {
        projectId: params.id,
        categoryId: cat.id,
        operationType: null,
        name,
        description: note,
        amount,
        receiptUrl,
        date: dateLabel,
        createdBy: session.user.name || session.user.email,
      },
      include: { category: { select: { id: true, name: true } } },
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    // DB gagal setelah file bukti sudah tersimpan — hapus lagi supaya tidak
    // nyangkut yatim di disk.
    console.error("[cost create] failed", err);
    await deleteUploadByUrl(receiptUrl);
    return NextResponse.json(
      { error: "Gagal menyimpan pengeluaran. Coba lagi." },
      { status: 500 }
    );
  }
}
