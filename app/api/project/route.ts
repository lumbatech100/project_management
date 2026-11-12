import { NextRequest, NextResponse } from "next/server";
import { getApiSession } from "@/lib/api-session";
import { prisma } from "@/lib/prisma";
import { canCreateProject } from "@/lib/utils";
import { getProjectsProgress } from "@/lib/project-progress";
import { projectListWhere } from "@/lib/project-access";

export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.project.findMany({
    where: projectListWhere(session.user.id, session.user.role),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      createdAt: true,
    },
  });
  const progressMap = await getProjectsProgress(projects.map((p) => p.id));

  const result = projects.map((p) => {
    const progress = progressMap.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      createdAt: p.createdAt,
      progress,
      // Kompatibilitas aplikasi lama: satu item semu yang merepresentasikan progress.
      items: [
        {
          bobot: 100,
          done: progress >= 100,
          progressPct: Math.round(progress),
        },
      ],
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canCreateProject(session.user.role, session.user.menus)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "Nama wajib diisi" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      members: {
        create: {
          userId: session.user.id,
          role: session.user.role,
        },
      },
    },
  });

  return NextResponse.json(project, { status: 201 });
}
