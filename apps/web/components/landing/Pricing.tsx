import Link from "next/link";
import { getPlans } from "@/lib/api-client";

const check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="mt-0.5 flex-shrink-0" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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
// showHeading -- default true (dipakai di homepage sebagai section di
// antara section lain, butuh judulnya sendiri). false dipakai HANYA oleh
// app/pricing/page.tsx, yang sudah punya <h1> + intro sendiri di atasnya
// -- tanpa ini judul yang sama akan tampil DUA KALI berurutan di halaman
// itu (h1 halaman, lalu h2 section persis di bawahnya).
export default async function Pricing({ showHeading = true }: { showHeading?: boolean }) {
  const plans = await getPlans().catch(() => null);
  const monthly = plans ? formatRupiah(plans.monthly_price_idr) : "Rp29.000";
  const yearly = plans ? formatRupiah(plans.yearly_price_idr) : "Rp299.000";

  return (
    <section id="pricing" className="relative overflow-hidden bg-white py-20 md:py-28" aria-label="Harga">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {showHeading && (
          <div className="reveal mx-auto mb-14 max-w-2xl text-center">
            <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Harga Sederhana untuk
              <br />
              <span className="text-gradient">Setiap Tahap Pertumbuhan</span>
            </h2>
            <p className="text-lg leading-relaxed text-muted">Mulai gratis. Upgrade ke Premium saat kamu siap memonetisasi lebih besar.</p>
          </div>
        )}

        <div className="mx-auto grid max-w-3xl items-start gap-6 md:grid-cols-2">
          <div className="reveal rounded-3xl border border-border bg-white p-8 shadow-card">
            <h3 className="mb-1 font-heading text-lg font-bold text-ink">Gratis</h3>
            <p className="mb-5 text-sm text-muted">Untuk kreator yang baru memulai</p>
            <p className="mb-1 font-heading text-4xl font-extrabold text-ink">
              Rp0<span className="text-base font-medium text-muted">/bln</span>
            </p>
            <Link href="/register" className="btn-ghost mb-7 mt-6 block cursor-pointer rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-ink">
              Mulai Sekarang
            </Link>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Tautan &amp; blok konten tanpa batas</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Semua tema (termasuk wallpaper &amp; video)</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>1 Halaman Toko</li>
              <li className="flex items-start gap-2.5 text-sm text-ink"><span className="text-green-600">{check}</span>Statistik kunjungan &amp; klik</li>
            </ul>
          </div>

          <div
            className="reveal relative rounded-3xl p-8 text-white shadow-hero"
            style={{ background: "linear-gradient(160deg,#1B4D3E,#145C52 60%,#C9A24B)", transitionDelay: "0.1s" }}
          >
            <span className="absolute -top-3 right-8 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-amber-900 shadow-md">
              Paling Populer
            </span>
            <h3 className="mb-1 font-heading text-lg font-bold">Premium</h3>
            <p className="mb-5 text-sm text-white/70">Untuk kreator siap memonetisasi lebih besar</p>
            <p className="mb-1 font-heading text-4xl font-extrabold">
              {monthly}<span className="text-base font-medium text-white/70">/bln</span>
            </p>
            <p className="mb-1 text-xs text-white/60">atau {yearly}/tahun</p>
            <Link href="/register" className="mb-7 mt-6 block cursor-pointer rounded-xl bg-white px-5 py-3 text-center font-heading text-sm font-bold text-primary transition-shadow hover:shadow-lg">
              Coba Premium
            </Link>
            <ul className="space-y-3">
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Semua fitur Gratis</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Hapus watermark Jeon.id</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Latar belakang kustom (warna/gradien/gambar)</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Sampai 5 Halaman Toko &amp; Halaman Tambahan</li>
              <li className="flex items-start gap-2.5 text-sm"><span className="text-yellow-300">{check}</span>Integrasi Meta Conversions API</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
