import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveEvidencePhoto } from "@/lib/storage";
import { isWorkerPosition } from "@/lib/worker-positions";
import { isBloodType } from "@/lib/blood-types";
import {
  WorkerFieldError,
  parseWorkerProfile,
  workerNameOrThrow,
  type WorkerProfileFields,
} from "@/lib/worker-validation";
import { checkPublicFormLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ token: string }> };

function asFile(v: FormDataEntryValue | null): File | null {
  if (!v || typeof v === "string") return null;
  if (!(v instanceof File) || v.size === 0) return null;
  return v;
}

export async function GET(_req: NextRequest, props: Params) {
  const params = await props.params;
  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Link tidak valid" }, { status: 400 });
  }

  const worker = await prisma.worker.findFirst({
    where: { inviteToken: token, active: true },
    include: {
      project: { select: { id: true, name: true } },
      group: { select: { id: true, name: true, kind: true } },
    },
  });

  if (!worker) {
    return NextResponse.json(
      { error: "Link tidak ditemukan atau sudah tidak aktif" },
      { status: 404 }
    );
  }

  if (worker.inviteStatus === "FILLED") {
    return NextResponse.json({
      projectName: worker.project.name,
      groupName: worker.group?.name || null,
      alreadyFilled: true,
    });
  }

  return NextResponse.json({
    projectName: worker.project.name,
    groupName: worker.group?.name || null,
    groupKind: worker.group?.kind || null,
    name: worker.name,
    position: worker.position,
    phone: worker.phone,
    email: worker.email,
    nik: worker.nik,
    address: worker.address,
    birthDate: worker.birthDate,
    gender: worker.gender,
    bloodType: worker.bloodType,
    emergencyName: worker.emergencyName,
    emergencyPhone: worker.emergencyPhone,
    hasPhotoKtp: !!worker.photoKtpUrl,
    hasPhotoSelfie: !!worker.photoSelfieUrl,
    inviteStatus: worker.inviteStatus,
    alreadyFilled: false,
  });
}

export async function POST(req: NextRequest, props: Params) {
  const params = await props.params;
  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Link tidak valid" }, { status: 400 });
  }

  const limit = checkPublicFormLimit("worker-invite", req.headers);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const worker = await prisma.worker.findFirst({
    where: { inviteToken: token, active: true },
  });
  if (!worker) {
    return NextResponse.json(
      { error: "Link tidak ditemukan atau sudah tidak aktif" },
      { status: 404 }
    );
  }
  if (worker.inviteStatus === "FILLED") {
    return NextResponse.json(
      { error: "Data sudah pernah dikirim. Hubungi admin / PM untuk perubahan." },
      { status: 410 }
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
  if (!isWorkerPosition(position)) {
    return NextResponse.json(
      { error: "Jabatan wajib: PM, SM, Leader, Worker, atau HSE" },
      { status: 400 }
    );
  }
  if (!photoKtp && !worker.photoKtpUrl) {
    return NextResponse.json({ error: "Foto KTP wajib" }, { status: 400 });
  }
  if (!photoSelfie && !worker.photoSelfieUrl) {
    return NextResponse.json({ error: "Foto diri wajib" }, { status: 400 });
  }

  let photoKtpUrl = worker.photoKtpUrl;
  let photoSelfieUrl = worker.photoSelfieUrl;
  try {
    if (photoKtp) {
      photoKtpUrl = (
        await saveEvidencePhoto(
          photoKtp,
          `worker-ktp-${worker.projectId.slice(0, 8)}`
        )
      ).url;
    }
    if (photoSelfie) {
      photoSelfieUrl = (
        await saveEvidencePhoto(
          photoSelfie,
          `worker-selfie-${worker.projectId.slice(0, 8)}`
        )
      ).url;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal upload foto" },
      { status: 400 }
    );
  }

  const updated = await prisma.worker.update({
    where: { id: worker.id },
    data: {
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
      joinedAt: worker.joinedAt || new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    name: updated.name,
    filledAt: updated.filledAt,
  });
}
