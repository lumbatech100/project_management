/**
 * Validasi startup — jalan sekali saat server Next.js boot (bukan per-request).
 * Tujuannya fail-fast: kalau env wajib belum di-set atau DB tidak bisa
 * dihubungi, proses langsung berhenti dengan pesan jelas di log, bukan
 * "online" di PM2 tapi melempar 500 generic di request pertama yang
 * menyentuh Prisma/NextAuth.
 *
 * Next.js App Router memanggil `register()` otomatis kalau file ini ada di
 * root project — tidak perlu flag experimental tambahan (stabil sejak Next 14).
 */
export async function register() {
  // Edge runtime (middleware) juga memanggil register() — skip, cuma perlu
  // sekali di proses Node utama.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const required = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(
      `[startup] Environment variable wajib belum di-set: ${missing.join(
        ", "
      )}. Aplikasi tidak akan berjalan dengan benar tanpa ini — cek .env (lihat .env.example).`
    );
    process.exit(1);
  }

  // lib/rate-limit.ts memakai in-memory store per-proses untuk brute-force
  // guard login & undangan. Kalau PM2 dijalankan cluster mode (>1 instance),
  // tiap worker punya bucket sendiri-sendiri sehingga limit efektif terkali
  // jumlah instance, dan reset total tiap restart/deploy.
  const appInstance = process.env.NODE_APP_INSTANCE;
  if (appInstance && appInstance !== "0") {
    console.warn(
      `[startup] Terdeteksi PM2 instance #${appInstance}. Rate limiter login/undangan ` +
        "(lib/rate-limit.ts) memakai in-memory store per-proses — di cluster mode ini " +
        "TIDAK efektif membatasi lintas instance. Jalankan dengan 1 instance (exec_mode: fork), " +
        "atau pindahkan store rate-limit ke Redis sebelum scale ke banyak instance."
    );
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error(
      "[startup] Gagal konek ke database. Cek DATABASE_URL dan pastikan Postgres jalan.",
      err
    );
    process.exit(1);
  }
}
