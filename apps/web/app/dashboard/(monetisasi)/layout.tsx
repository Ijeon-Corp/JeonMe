"use client";

// Route group (monetisasi) -- permintaan langsung pengguna, 10 Agustus
// 2026: "semua yang ada di produk dan monetisasi itu dibuat jadi tab saja
// bukan menumpuk". SEBELUMNYA /dashboard/monetisasi adalah hub (search +
// 8 kartu) yang masing-masing LINK KELUAR ke halaman penuh terpisah --
// pola beda dari Toko (/dashboard/products) yang sudah pakai tab internal
// (Overview/Manage Items/dst). Nama folder route group diapit tanda kurung
// SENGAJA -- konvensi Next.js App Router supaya folder ini TIDAK ikut jadi
// bagian URL: 8 halaman fitur + hub tetap persis di /dashboard/vouchers,
// /dashboard/donation, dst (bookmark, tautan EXTRA_PAGE_LABELS di
// dashboard/layout.tsx, dan seluruh E2E yang goto() langsung ke URL itu
// TIDAK ada yang berubah). Konten tiap halaman (page.tsx di dalam
// masing-masing folder) TIDAK disentuh sama sekali -- murni pembungkus
// navigasi.
//
// REVISI 3 September 2026 (permintaan pengguna: "banyak sekali tab yang
// tidak berkaitan, lalu saat klik tab tiba-tiba pindah page yang jauh"):
// bilah tab lintas-fitur yang sebelumnya di sini (Voucher/Bundel/Donasi/
// Afiliasi/Brand/Event/Kursus) dihapus -- bertentangan dengan IA v2 yang
// memecah halaman-halaman ini ke grup sidebar Jualan (Kursus/Event/
// Dukungan) dan Marketing (Voucher/Bundel/Afiliasi/Brand/Loyalitas):
// breadcrumb bilang "Marketing / Afiliasi" tapi bilah tab menawarkan
// Event/Kursus -- sekali klik halaman berganti DAN grup sidebar ikut
// melompat. Sidebar jadi satu-satunya navigasi antar-halaman sekarang,
// tiap halaman punya PageHeader-nya sendiri. LENGKAP & stabil di
// production sejak v0.37.0/v0.38.0, flag "marketing" dihapus dari file
// ini 8 September 2026.
export default function MonetisasiLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl">{children}</div>;
}
