import {
  IconCalendar,
  IconChevronRight,
  IconGift,
  IconInstagram,
  IconLink,
  IconMail,
  IconPaintbrush,
  IconPlayCircle,
  IconStar,
  IconTextLines,
  IconTiktok,
  IconTrendArrow,
  IconWhatsapp,
} from "@/components/icons";

// Panel visual kanan halaman /register & /login -- permintaan langsung
// pengguna, 10 Agustus 2026, dengan referensi mockup baru (telepon bio +
// 5 kartu mengambang: Kustomisasi, Booking, Total Klik, Sumber Trafik,
// Tautan Teratas). SENGAJA tidak meniru konten referensi apa adanya --
// nama "kirana.id", avatar gradien tanpa foto asli, dan semua angka contoh
// netral menunjukkan fitur JEONME SUNGGUHAN (Desain, Booking Konsultasi,
// Statistik/Top Links, Sumber Trafik -- lihat dashboard/page.tsx &
// dashboard/(monetisasi)/bookings/page.tsx) supaya tidak jadi klaim
// pelanggan/pendapatan palsu. Warna ikon dipertahankan hijau/emas tema
// (bukan "pop" warna-warni) -- konsisten dengan penyeragaman warna ikon
// Monetisasi & Settings di sesi yang sama.
export default function AuthShowcase() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      <div className="relative flex flex-1 items-center justify-center py-10">
        {/* Bezel telepon -- mockup statis halaman bio Jeonme, bukan
            screenshot sungguhan (tidak ada foto pengguna nyata dipakai). */}
        <div className="relative w-[270px] flex-shrink-0 rounded-[2.75rem] border-[10px] border-ink bg-white p-4 shadow-hero">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/80" />

          <div className="relative flex flex-col items-center gap-2 pb-2">
            {/* Blob dekoratif -- kelas .blob yang sudah ada (globals.css),
                dipakai ulang supaya tidak menambah animasi/CSS baru. */}
            <div className="blob absolute -top-2 left-1/2 h-20 w-20 -translate-x-1/2 bg-primary-subtle" aria-hidden="true" />
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-secondary to-primary" />
            <p className="relative font-heading text-sm font-bold text-ink">kirana.id</p>
            <p className="relative px-4 text-center text-[11px] text-muted">Konten &amp; preset foto · Slot kelas online tiap Jumat</p>
            <div className="relative flex items-center gap-2 pt-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconInstagram className="h-3 w-3" /></span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconTiktok className="h-3 w-3" /></span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconWhatsapp className="h-3 w-3" /></span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {[
              { label: "Preset Lightroom", icon: IconGift },
              { label: "Kelas Online Jumat", icon: IconPlayCircle },
              { label: "Dukung Kirana", icon: IconStar },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-xl bg-primary-dark px-2.5 py-2 text-white">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <item.icon className="h-3 w-3" />
                </span>
                <span className="flex-1 truncate text-[11px] font-semibold">{item.label}</span>
                <IconChevronRight className="h-3 w-3 flex-shrink-0 text-white/50" />
              </div>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-dashed border-border px-2.5 py-2">
            <IconMail className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
            <span className="flex-1 truncate text-[10px] font-semibold text-muted">Gabung newsletter Kirana</span>
          </div>

          <p className="mt-3 text-center text-[9px] text-muted">
            dibuat dengan <span className="text-red-400">&#9829;</span> jeonme
          </p>
        </div>

        {/* Kartu "Kustomisasi" mengambang -- fitur Desain sungguhan (Tema/
            Header/Tombol/Font/Stiker, menu Desain dashboard). */}
        <div className="absolute left-0 top-2 hidden w-32 flex-col gap-1.5 rounded-2xl border border-border bg-white p-3 shadow-card xl:flex">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Kustomisasi</p>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <IconPaintbrush className="h-3.5 w-3.5 text-primary" /> Tema &amp; Warna
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <IconTextLines className="h-3.5 w-3.5 text-primary" /> Font
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <span className="h-4 w-4 rounded-full bg-primary" />
            <span className="h-4 w-4 rounded-full bg-secondary" />
            <span className="h-4 w-4 rounded-full bg-accent" />
          </div>
        </div>

        {/* Kartu "Booking" mengambang -- fitur Booking Konsultasi sungguhan
            (dashboard/(monetisasi)/bookings). */}
        <div className="absolute right-0 top-0 hidden w-36 flex-col gap-1 rounded-2xl border border-border bg-white p-3 shadow-card sm:flex">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-accent-dark">
            <IconStar className="h-3 w-3" />
          </span>
          <p className="mt-1 text-[11px] font-bold leading-tight text-ink">Konsultasi 1:1</p>
          <p className="text-[10px] text-muted">Booking slot bareng Kirana</p>
          <div className="mt-1 flex items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[10px] font-bold text-white">
            <IconCalendar className="h-3 w-3" /> Booking
          </div>
        </div>

        {/* Kartu "Total Klik" mengambang -- metrik Statistik sungguhan. */}
        <div className="absolute right-0 top-[42%] hidden w-32 -translate-y-1/2 flex-col gap-1 rounded-2xl border border-border bg-white p-3 shadow-card lg:flex">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Klik</p>
          <div className="flex items-baseline gap-1.5">
            <p className="font-heading text-base font-bold tabular-nums text-ink">23.487</p>
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-secondary-dark">
              <IconTrendArrow className="h-2.5 w-2.5" />32%
            </span>
          </div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-full">
            <path d="M0,26 L20,20 L40,22 L60,10 L80,12 L100,2" fill="none" stroke="#1F7A6C" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        {/* Kartu "Sumber Trafik" mengambang -- fitur Statistik sungguhan
            (top_referrers di dashboard/page.tsx). */}
        <div className="absolute left-0 bottom-6 hidden w-40 flex-col gap-1.5 rounded-2xl border border-border bg-white p-3 shadow-card sm:flex">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Sumber Trafik</p>
          {[
            { label: "Instagram", pct: 58 },
            { label: "TikTok", pct: 27 },
            { label: "WhatsApp", pct: 15 },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-1.5">
              <span className="w-16 flex-shrink-0 truncate text-[10px] font-semibold text-ink">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-subtle">
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Kartu "Tautan Teratas" mengambang -- fitur Statistik sungguhan
            (link paling banyak diklik). */}
        <div className="absolute right-0 bottom-2 hidden w-40 flex-col gap-1.5 rounded-2xl border border-border bg-white p-3 shadow-card xl:flex">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted">
            <IconLink className="h-3 w-3" /> Tautan Teratas
          </p>
          {[
            { label: "Konsultasi", pct: 100 },
            { label: "Preset Lightroom", pct: 75 },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-1.5">
              <span className="w-20 flex-shrink-0 truncate text-[10px] font-semibold text-ink">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-subtle">
                <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="max-w-md pb-2 font-heading text-2xl font-bold leading-snug text-ink" style={{ textWrap: "balance" }}>
        Satu halaman untuk jualan produk, terima dukungan, dan kelola semua link kamu.
      </p>
    </div>
  );
}
