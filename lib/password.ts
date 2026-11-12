import { compare } from "bcryptjs";

/** Hash acak tanpa password yang diketahui; dipakai saat email tidak terdaftar. */
const DUMMY_HASH =
  "$2b$10$N3Ep7YSVtpcjAJpfP1stR.3vCE4N9vhIvbHTVkGnKVlLnmljz5V92";

/**
 * Bandingkan password dengan waktu proses yang sama baik user ada maupun tidak,
 * supaya respons login tidak bisa dipakai untuk menebak email terdaftar.
 */
export async function verifyPassword(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  const valid = await compare(password, hash || DUMMY_HASH);
  return !!hash && valid;
}
