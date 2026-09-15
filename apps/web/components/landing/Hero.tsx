"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "@/lib/locale-context";

// Hero -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §11.2, Fase 2): headline display raksasa
// (awalnya SELALU 2 baris, "Bangun / kehadiranmu." -- lihat susulan 6
// September 2026 di bawah soal kenapa sekarang kadang 3 baris), CTA
// coral (semantic mapping spec §6: CTA marketing = coral). Gambar
// hero-v2.png lama (mockup hijau identitas lama) sempat diganti FLIP
// CARD interaktif murni CSS (klik untuk lihat sisi bio fiktif "maya.lin"
// vs sisi statistik fiktif).
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
        {/* minmax(0,Nfr) -- permintaan langsung pengguna, 6 September
            2026: "di homepage gambar nya kecil bangett buat jadi besar".
            Tanpa minmax(0,...) di sini, track grid tanpa minmax eksplisit
            defaultnya minmax(auto,Nfr) -- kata tak terpisah di headline
            ("kehadiranmu.", satu kata utuh tanpa spasi) diam-diam memaksa
            lebar MINIMUM kolom kiri jauh melebihi porsi 1.2fr-nya,
            menyisakan kolom kanan cuma ~330px di HAMPIR SEMUA lebar
            viewport (bukan sekadar layar sempit) -- baru ketahuan sesudah
            gambar hero.png dipasang (sebelumnya "tersembunyi" karena flip
            card lama memang sengaja fixed 300px, kebetulan pas dengan
            batas ini). minmax(0,Nfr) mematikan minimum otomatis itu
            supaya rasio 1.2:1 sungguhan berlaku -- gambar sekarang
            ~1.7x lebih besar (lihat max-w-[640px] di bawah, ~527-575px
            tercapai di kebanyakan lebar).
            Konsekuensi: h1 di bawah diberi break-words supaya AMAN kalau
            kolom kiri jadi lebih sempit dari kata terpanjang (browser
            membelah di tengah kata alih-alih meluber ke kolom gambar
            seperti percobaan pertama tanpa break-words) -- efek
            sampingnya headline "Bangun/kehadiranmu." yang tadinya SELALU
            2 baris sekarang pecah jadi 3 baris ("Bangun/kehadiran/mu.")
            di kebanyakan lebar layar, karena kata itu memang tidak pernah
            muat 1 baris dalam kolom seukuran apa pun yang masih
            menyisakan porsi wajar utk gambar. Dicoba rasio 1.4fr:1fr
            (kolom kiri lebih lega) tapi TETAP pecah 3 baris di lebar
            desktop umum (1024-1440px) -- kata itu sesederhana terlalu
            lebar pada clamp(...,9rem), jadi 1.2fr dipertahankan supaya
            gambar dapat porsi maksimal alih-alih basa-basi rasio yang
            tidak menyelamatkan apa pun di headline. */}
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8">
          <div className="text-center lg:text-left">
            <h1 className="reveal mb-7 break-words font-display font-extrabold leading-[0.88] tracking-[-0.03em] text-jeon-ink">
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

          <div className="flex justify-center pb-4 lg:justify-end">
            {/* next/image (audit performa 15 September 2026): hero.png aslinya
                1536x1024 PNG ~1,7 MB dan ini elemen LCP halaman depan -- satu-
                satunya gambar terbesar yang langsung terlihat tanpa scroll.
                width/height diisi dimensi ASLI (bukan ukuran render) supaya
                rasio 3:2-nya dipakai Next.js untuk mencegah layout shift;
                lebar TAMPIL tetap diatur CSS `w-full max-w-[640px]` seperti
                sebelumnya. `h-auto` WAJIB ditambahkan: <Image> memasang atribut
                width/height sungguhan pada <img>, jadi tanpa itu `w-full` akan
                meregang lebar sementara tingginya terkunci 1024px (gambar jadi
                gepeng) -- beda dari <img> polos tanpa atribut dimensi.
                fetchPriority="high" (BUKAN `preload`) sesuai anjuran dokumen
                Next.js 16 untuk kasus LCP biasa, dan konsisten dgn pola yang
                sudah dipakai untuk avatar di PagePreview.tsx. */}
            <Image
              src="/homepage/hero.png"
              alt="Contoh halaman jeon.id -- bio, konten, dan statistik kreator dalam satu tautan"
              width={1536}
              height={1024}
              fetchPriority="high"
              sizes="(max-width: 680px) 100vw, 640px"
              className="h-auto w-full max-w-[640px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
