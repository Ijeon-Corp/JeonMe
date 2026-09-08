// Feature flag redesign dashboard (JEONID-DASHBOARD-REDESIGN-SPEC.md §24.3,
// aturan §0.9). Spec eksplisit: "Jangan membangun sistem flag kompleks baru
// jika belum ada; wrapper server/environment cukup" -- repo tidak punya
// sistem flag, jadi ini wrapper env sederhana.
//
// Model OPT-OUT (default AKTIF): area baru langsung tampil di build berikutnya
// tanpa perlu menyetel env di CI/VPS; rollback per-area = set
// NEXT_PUBLIC_DASH_REDESIGN_OFF (daftar dipisah koma, mis. "marketing,shell"
// atau "all") lalu rebuild -- memenuhi jaminan rollback §25 ("flag off
// mengembalikan UI lama") tanpa infra tambahan. Kode legacy per area TIDAK
// dihapus sampai dua rilis stabil (§25 Rollback).
// "marketing" (8 September 2026) & "settings" (8 September 2026) sudah
// dihapus -- seluruh file yang memakainya (affiliates/vouchers/bundles/
// audience/social-proof/monetisasi-layout untuk "marketing"; settings-
// layout/kyc/balance/team/social-connect/analytics untuk "settings")
// sudah dibersihkan dari flag ini (redesign LENGKAP & stabil sejak
// v0.37.0/v0.38.0). NEXT_PUBLIC_DASH_REDESIGN_OFF dengan nilai itu
// sekarang jadi no-op kalau masih diset di env manapun -- bukan error.
export type DashRedesignArea =
  | "shell"
  | "home"
  | "page_builder"
  | "sales";

const OFF_LIST = (process.env.NEXT_PUBLIC_DASH_REDESIGN_OFF ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function dashRedesignEnabled(area: DashRedesignArea): boolean {
  if (OFF_LIST.includes("all")) return false;
  return !OFF_LIST.includes(area);
}
