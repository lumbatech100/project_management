import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveEvidencePhoto } from "@/lib/storage";
import { isInvitePosition } from "@/lib/worker-positions";
import { isBloodType } from "@/lib/blood-types";
import {
  WorkerFieldError,
  parseWorkerProfile,
  workerNameOrThrow,
  type WorkerProfileFields,
} from "@/lib/worker-validation";
import { checkPublicFormLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Link tidak valid" }, { status: 400 });
  }

  const group = await prisma.workerGroup.findFirst({
    where: { inviteToken: token, inviteEnabled: true },
    include: {
      project: { select: { id: true, name: true, status: true } },
    },
  });

  if (!group || group.project.status !== "active") {
    return NextResponse.json(
      { error: "Link tidak ditemukan atau sudah dinonaktifkan" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    mode: "open",
    projectName: group.project.name,
    groupName: group.name,
    groupKind: group.kind,
  });
}

function asFile(v: FormDataEntryValue | null): File | null {
  if (!v || typeof v === "string") return null;
  if (!(v instanceof File) || v.size === 0) return null;
  return v;
}

/** Satu link grup → tiap submit buat pekerja baru + foto KTP & selfie wajib. */
export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Link tidak valid" }, { status: 400 });
  }

  const limit = checkPublicFormLimit(`group-invite:${token}`, req.headers, 30);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak pengiriman. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const group = await prisma.workerGroup.findFirst({
    where: { inviteToken: token, inviteEnabled: true },
    include: {
      project: { select: { id: true, status: true } },
    },
  });

  if (!group || group.project.status !== "active") {
    return NextResponse.json(
      { error: "Link tidak ditemukan atau sudah dinonaktifkan" },
      { status: 404 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Data form tidak valid" }, { status: 400 });
  }

  const name = String(form.get("name") || "").trim();
  const phone = String(form.get("phone") || "").trim();
  const position = String(form.get("position") || "").trim();
  const email = String(form.get("email") || "").trim();
  const nik = String(form.get("nik") || "").trim();
  const address = String(form.get("address") || "").trim();
  const birthDate = String(form.get("birthDate") || "").trim();
  const gender = String(form.get("gender") || "").trim();
  const bloodType = String(form.get("bloodType") || "").trim();
  const emergencyName = String(form.get("emergencyName") || "").trim();
  const emergencyPhone = String(form.get("emergencyPhone") || "").trim();
  const photoKtp = asFile(form.get("photoKtp"));
  const photoSelfie = asFile(form.get("photoSelfie"));

  if (!name) {
    return NextResponse.json({ error: "Nama lengkap wajib" }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: "Nomor HP wajib" }, { status: 400 });
  }
  if (!emergencyName) {
    return NextResponse.json(
      { error: "Nama kontak darurat wajib" },
      { status: 400 }
    );
  }
  if (!emergencyPhone) {
    return NextResponse.json(
      { error: "Nomor HP kontak darurat wajib" },
      { status: 400 }
    );
  }
  if (!isBloodType(bloodType)) {
    return NextResponse.json(
      { error: "Golongan darah wajib dipilih" },
      { status: 400 }
    );
  }
  let profile: WorkerProfileFields;
  try {
    profile = parseWorkerProfile({
      phone,
      email,
      nik,
      address,
      gender,
      bloodType,
      emergencyName,
      emergencyPhone,
      birthDate,
    });
    workerNameOrThrow(name);
  } catch (err) {
    if (err instanceof WorkerFieldError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  if (!isInvitePosition(position)) {
    return NextResponse.json(
      { error: "Jabatan wajib: Leader, Worker, atau HSE" },
      { status: 400 }
    );
  }
  if (!photoKtp) {
    return NextResponse.json({ error: "Foto KTP wajib" }, { status: 400 });
  }
  if (!photoSelfie) {
    return NextResponse.json({ error: "Foto diri wajib" }, { status: 400 });
  }

  let photoKtpUrl: string;
  let photoSelfieUrl: string;
  try {
    photoKtpUrl = (
      await saveEvidencePhoto(photoKtp, `worker-ktp-${group.projectId.slice(0, 8)}`)
    ).url;
    photoSelfieUrl = (
      await saveEvidencePhoto(
        photoSelfie,
        `worker-selfie-${group.projectId.slice(0, 8)}`
      )
    ).url;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal upload foto" },
      { status: 400 }
    );
  }

  const worker = await prisma.worker.create({
    data: {
      projectId: group.projectId,
      groupId: group.id,
      name,
      phone: profile.phone!,
      position,
      email: profile.email ?? null,
      nik: profile.nik ?? null,
      address: profile.address ?? null,
      birthDate: profile.birthDate ?? null,
      gender: profile.gender ?? null,
      bloodType,
      emergencyName,
      emergencyPhone: profile.emergencyPhone!,
      photoKtpUrl,
      photoSelfieUrl,
      inviteStatus: "FILLED",
      filledAt: new Date(),
      joinedAt: new Date(),
      active: true,
    },
  });

  return NextResponse.json({
    ok: true,
    name: worker.name,
    filledAt: worker.filledAt,
  });
}
