import { getPlans } from "@/lib/api-client";
import PricingCards from "./PricingCards";

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

// Pricing -- perbaikan SEO/marketing (temuan audit, 15 Agustus 2026):
// SEBELUMNYA menampilkan 3 paket KARANGAN (Gratis/Pro/Business, harga
// Rp149rb/Rp399rb) yang sama sekali tidak cocok dengan produk sungguhan
// -- backend cuma punya SATU paket berbayar (Premium, lihat
// SubscriptionHandler & migrasi terkait), bukan Pro/Business terpisah.
// Sekarang 2 kartu (Gratis vs Premium) dengan harga ASLI dari
// getPlans() (endpoint publik baru, lihat komentar di api-client.ts) --
// satu sumber kebenaran yang sama dengan halaman Pengaturan > Langganan
// di dashboard, bukan angka hardcode kedua kalinya. Daftar fitur di
// bawah ditelusuri LANGSUNG dari setiap gerbang `isPremiumUser` di
// backend (watermark, latar kustom, batas Halaman Toko/Tambahan, Meta
// Conversions API) -- bukan tebakan.
//
// Modul Dark/Light Mode + Pilihan Bahasa (permintaan langsung pengguna,
// 29 Agustus 2026): JSX/teks sekarang dipisah ke PricingCards.tsx (Client
// Component, butuh useLocale()) -- komponen INI tetap Server Component
// murni, hanya mengambil data harga (SSR utuh, TIDAK ada perubahan
// perilaku fetch dari sebelumnya).
//
// showHeading -- default true (dipakai di homepage sebagai section di
// antara section lain, butuh judulnya sendiri). false dipakai HANYA oleh
// app/pricing/page.tsx, yang sudah punya <h1> + intro sendiri di atasnya
// -- tanpa ini judul yang sama akan tampil DUA KALI berurutan di halaman
// itu (h1 halaman, lalu h2 section persis di bawahnya).
export default async function Pricing({ showHeading = true }: { showHeading?: boolean }) {
  const plans = await getPlans().catch(() => null);
  const monthly = plans ? formatRupiah(plans.monthly_price_idr) : "Rp99.000";
  const yearly = plans ? formatRupiah(plans.yearly_price_idr) : "Rp999.000";

  return <PricingCards monthly={monthly} yearly={yearly} showHeading={showHeading} />;
}
