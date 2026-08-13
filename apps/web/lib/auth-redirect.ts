import { getAdminSummary } from "@/lib/api-client";

// redirectAfterAuth -- diekstrak dari afterLoginSuccess() di /login
// (13 Agustus 2026, susulan penambahan login Google) supaya login
// password, verifikasi 2FA, MAUPUN login/daftar Google (lihat
// app/auth/google/callback/page.tsx) semuanya berakhir di tempat yang
// sama lewat logika yang identik -- tidak ada klaim "role" di JWT
// (AdminRequired selalu cek DB langsung, lihat middleware), jadi cara
// termudah tahu status admin ya langsung coba salah satu endpoint admin.
// 403/error apa pun berarti bukan admin, arahkan ke dashboard kreator
// seperti biasa.
export async function redirectAfterAuth(router: { push: (href: string) => void }): Promise<void> {
  try {
    await getAdminSummary();
    router.push("/admin");
  } catch {
    router.push("/dashboard");
  }
}
