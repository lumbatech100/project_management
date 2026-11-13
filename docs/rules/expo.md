# Aturan Project

## Build & verifikasi
- Jangan pernah menjalankan `eas build`, `expo run:*`, atau build native apapun sendiri.
- Verifikasi perubahan hanya dengan `npx tsc --noEmit` dan `npx eslint`.
- Jangan generate link download/APK. Hasil dicek lewat Expo Go di HP.
- Wajib sarankan kapan perlu build native dan kapan tidak:
  - Tidak perlu build: UI, warna, teks, logic JS/TS, API client — cukup reload Expo Go.
  - Perlu build: native dependency baru, plugin Expo, perubahan `app.json`/`eas.json` yang native, SDK bump, atau fitur yang Expo Go tidak dukung.
- Jangan menunggu diminta. Kalau ragu, jelaskan kenapa perlu atau tidak perlu, lalu tanya konfirmasi sebelum build.

## Stack
- Expo SDK 58, Expo Router, React Native, TypeScript
- Hanya pakai library yang kompatibel dengan Expo Go. Kalau butuh library native di luar itu, tanya dulu.

## Struktur
- app/ (routes), components/, lib/ (api client, util), hooks/
