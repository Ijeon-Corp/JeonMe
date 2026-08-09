import { IconBox, IconInstagram, IconPaintbrush, IconPlayCircle, IconTextLines, IconTiktok, IconWallet, IconWhatsapp } from "@/components/icons";

// Panel visual kanan halaman /register & /login (permintaan langsung
// pengguna, referensi tangkapan layar halaman signup Beacons -- layout
// split-screen: form minimal di kiri, showcase produk mengambang di kanan).
// SENGAJA tidak meniru konten Beacons apa adanya -- mockup telepon & kartu
// mengambang di sini menunjukkan fitur JEONME SUNGGUHAN (Desain, Pendapatan,
// Sumber Trafik, lihat dashboard/page.tsx) dengan warna "pop" yang sama
// dipakai redesain dashboard, supaya konsisten satu bahasa visual. Testimoni
// bernama+foto+angka pendapatan spesifik ala referensi SENGAJA tidak ditiru
// (akan jadi klaim pelanggan palsu) -- diganti pernyataan nilai jujur tanpa
// atribusi ke orang tertentu.
export default function AuthShowcase() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      <div className="relative flex flex-1 items-center justify-center py-10">
        {/* Bezel telepon -- mockup statis halaman bio Jeonme, bukan
            screenshot sungguhan (tidak ada foto pengguna nyata dipakai). */}
        <div className="relative w-[280px] flex-shrink-0 rounded-[2.75rem] border-[10px] border-ink bg-white p-4 shadow-hero">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/80" />
          <div className="flex flex-col items-center gap-2 pb-2">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-secondary to-primary" />
            <p className="font-heading text-sm font-bold text-ink">kirana.id</p>
            <p className="px-4 text-center text-[11px] text-muted">Konten &amp; preset foto · Slot kelas online tiap Jumat</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconInstagram className="h-3 w-3" /></span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconTiktok className="h-3 w-3" /></span>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary"><IconWhatsapp className="h-3 w-3" /></span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 rounded-full bg-pop-blue-tint px-3 py-2 text-[11px] font-semibold text-ink">
              <IconBox className="h-3.5 w-3.5 flex-shrink-0 text-pop-blue" /> Preset Lightroom
            </div>
            <div className="flex items-center gap-2 rounded-full bg-pop-yellow-tint px-3 py-2 text-[11px] font-semibold text-ink">
              <IconPlayCircle className="h-3.5 w-3.5 flex-shrink-0 text-accent-dark" /> Kelas Online Jumat
            </div>
            <div className="flex items-center gap-2 rounded-full bg-pop-lilac-tint px-3 py-2 text-[11px] font-semibold text-ink">
              <IconWallet className="h-3.5 w-3.5 flex-shrink-0 text-pop-lilac" /> Dukung Kirana
            </div>
          </div>
        </div>

        {/* Kartu "Desain" mengambang -- fitur Tema/Header/Tombol/Font/Stiker
            sungguhan (menu Desain dashboard). */}
        <div className="absolute right-2 top-8 hidden w-36 rotate-[5deg] flex-col gap-2 rounded-2xl border border-border bg-white p-3 shadow-card xl:flex">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Desain</p>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <IconPaintbrush className="h-3.5 w-3.5 text-primary" /> Tema &amp; Warna
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <IconTextLines className="h-3.5 w-3.5 text-primary" /> Font
          </div>
          <div className="flex gap-1.5 pt-0.5">
            <span className="h-4 w-4 rounded-full bg-primary" />
            <span className="h-4 w-4 rounded-full bg-pop-pink" />
            <span className="h-4 w-4 rounded-full bg-pop-yellow" />
            <span className="h-4 w-4 rounded-full bg-pop-blue" />
          </div>
        </div>

        {/* Kartu "Pendapatan" mengambang -- angka contoh netral (bukan klaim
            pendapatan pengguna sungguhan mana pun). */}
        <div className="absolute -right-2 bottom-16 hidden w-40 -rotate-3 flex-col gap-1 rounded-2xl border border-border bg-white p-3 shadow-card sm:flex">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
            <IconWallet className="h-3 w-3" /> Pendapatan
          </div>
          <p className="font-heading text-base font-bold tabular-nums text-ink">Rp3.240.000</p>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-6 w-full">
            <path d="M0,26 L20,20 L40,22 L60,10 L80,12 L100,2" fill="none" stroke="#1F7A6C" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        {/* Kartu "Sumber Trafik" mengambang -- fitur Statistik sungguhan
            (top_referrers di dashboard/page.tsx). */}
        <div className="absolute left-1 bottom-4 hidden w-40 rotate-[-4deg] flex-col gap-1.5 rounded-2xl border border-border bg-white p-3 shadow-card sm:flex">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Sumber Trafik</p>
          {[
            { label: "Instagram", pct: 58, tone: "bg-pop-pink" },
            { label: "TikTok", pct: 27, tone: "bg-ink" },
            { label: "WhatsApp", pct: 15, tone: "bg-secondary" },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-1.5">
              <span className="w-14 flex-shrink-0 truncate text-[10px] font-semibold text-ink">{r.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-subtle">
                <div className={`h-full rounded-full ${r.tone}`} style={{ width: `${r.pct}%` }} />
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
