"use client";

import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

// Hero -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.2, Fase 2): headline display raksasa 2
// baris ("Bangun / kehadiranmu."), CTA coral (semantic mapping spec §6:
// CTA marketing = coral). Gambar hero-v2.png lama (mockup hijau identitas
// lama) sempat diganti FLIP CARD interaktif murni CSS (klik untuk lihat
// sisi bio fiktif "maya.lin" vs sisi statistik fiktif).
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "sekarang
// di bagian hero section pakai gambar yang ada di folder homepage
// hero.png") -- flip card DIGANTI gambar mockup foto asli
// public/homepage/hero.png (persona sama "Maya Lin", gaya sama dengan
// hero-joyful.png/public/homepage/product|templates/*.png). Gambar ini
// SUDAH mengandung chip statistik + badge mengambangnya sendiri (Kreator
// berkembang/24 produk terjual/BARU/+1.248 klik hari ini/Dipakai 50K+
// kreator), jadi interaksi flip tidak lagi relevan -- satu gambar statis
// sudah menyampaikan bio DAN statistik sekaligus tanpa perlu diklik.
//
// CATATAN soal badge "Dipakai 50K+ kreator" YANG SUDAH TERCETAK DI
// GAMBAR: ini SECARA LANGSUNG bertentangan dengan keputusan lama di
// bawah (badge "Dipercaya 10.000+ kreator" dihapus karena tidak ada
// angka terverifikasi, REDESIGN-AUDIT.md konflik #8) -- dikonfirmasi
// ULANG lewat AskUserQuestion sebelum gambar ini dipasang (6 September
// 2026), pengguna memilih "Pakai apa adanya (angka ini akurat/disetujui)"
// -- jadi ini BUKAN pelanggaran diam-diam atas kebijakan lama, melainkan
// keputusan bisnis baru yang sengaja menimpanya. Kalau suatu saat
// angkanya berubah/tidak lagi akurat, gambarnya sendiri yang perlu
// diperbarui (teksnya baked-in di raster, bukan string i18n).
export default function Hero() {
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden bg-jeon-paper pb-20 pt-28 md:pb-28 md:pt-40" aria-label="Hero">
      {/* Dekorasi geometris playful -- bentuk kecil ber-outline ink di
          tepi, jauh dari CTA (spec: dekorasi tidak boleh menghalangi CTA). */}
      <div aria-hidden="true" className="absolute left-[6%] top-24 hidden h-10 w-10 rotate-12 rounded-jsm border-2 border-[#111111] bg-jeon-lime md:block" />
      <div aria-hidden="true" className="absolute right-[8%] top-32 hidden h-8 w-8 rounded-full border-2 border-[#111111] bg-jeon-pink md:block" />
      <div aria-hidden="true" className="absolute bottom-16 left-[12%] hidden select-none font-display text-3xl text-jeon-purple md:block">
        ✦
      </div>

      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
          <div className="text-center lg:text-left">
            <h1 className="reveal mb-7 font-display font-extrabold leading-[0.88] tracking-[-0.03em] text-jeon-ink">
              <span className="block text-[clamp(3.5rem,10vw,9rem)]">{t("hero.title1")}</span>
              <span className="block text-[clamp(3.5rem,10vw,9rem)] text-jeon-purple">{t("hero.titleGradient")}</span>
            </h1>

            <p className="reveal mx-auto mb-9 max-w-lg text-lg leading-relaxed text-jeon-muted sm:text-xl lg:mx-0" style={{ transitionDelay: "0.1s" }}>
              {t("hero.subtitle")}
            </p>

            <div className="reveal flex flex-col justify-center gap-3 sm:flex-row lg:justify-start" style={{ transitionDelay: "0.15s" }}>
              <Link
                href="/register"
                className="cursor-pointer rounded-jmd border-2 border-jeon-ink bg-jeon-coral px-8 py-4 text-center font-display text-base font-bold text-white shadow-brutal transition-transform duration-150 hover:-translate-y-1 active:translate-y-0 active:shadow-none"
              >
                {t("hero.ctaPrimary")}
              </Link>
              <a
                href="#features"
                className="flex cursor-pointer items-center justify-center gap-2 rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-8 py-4 text-center text-base font-bold text-jeon-ink transition-transform duration-150 hover:-translate-y-1"
              >
                {t("hero.ctaSecondary")}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </a>
            </div>
          </div>

          {/* max-w-[420px] BUKAN percobaan pertama -- kolom kanan grid ini
              lebarnya dibatasi min-content kolom kiri (kata tak terpisah
              di headline raksasa, mis. "kehadiranmu." pada
              clamp(...,9rem), menuntut lebar minimum sendiri) BUKAN murni
              rasio 1.2fr:1fr, jadi ruang yang benar-benar tersedia di
              sini natural-nya ~330-380px di kebanyakan lebar viewport --
              persis alasan kartu flip lama juga fixed 300px, bukan
              kebetulan. minmax(0,fr) SEMPAT dicoba supaya rasio fr
              benar-benar berlaku, tapi headline jadi overflow menimpa
              gambar. 420px dipilih setelah verifikasi visual di beberapa
              lebar viewport (1024/1440/1920) -- tidak pernah terpotong
              oleh cap ini (constraint asli grid selalu lebih ketat),
              cap ini murni jaring pengaman kalau suatu saat headline
              diperpendek/font diperkecil dan ruang kanan jadi lebih
              lega dari sekarang. */}
          <div className="flex justify-center pb-4 lg:justify-end">
            {/* eslint-disable-next-line @next/next/no-img-element -- mockup lokal di public/, bukan gambar kreator */}
            <img
              src="/homepage/hero.png"
              alt="Contoh halaman jeon.id -- bio, konten, dan statistik kreator dalam satu tautan"
              className="w-full max-w-[420px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
