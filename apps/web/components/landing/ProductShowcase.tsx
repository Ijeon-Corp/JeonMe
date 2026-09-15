"use client";

import Image from "next/image";
import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";
import { QUICK_SETUP_TEMPLATES } from "@/lib/quick-setup-templates";
import { useLocale } from "@/lib/locale-context";

// ProductShowcase -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: "isinya di sesuaikan dengan tema dulu saja
// tidak usah pakai image dan icon yang sudah ada dari lama") sempat
// mengganti carousel mockup <PagePreview> sungguhan dengan kartu mini-bio
// bergaya token redesign murni CSS.
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "untuk
// section product showcase gunakan semua gambar dari homepage product
// supaya menampilkan gambar asli") -- kartu CSS polos DIGANTI mockup foto
// asli di public/homepage/product/ (satu render per kategori, gaya sama
// dengan hero-joyful.png). Cuma 6 dari 8 kategori CURATED sebelumnya yang
// punya gambar jadi (fullstack-developer/book-author/teacher/freelancer/
// online-store/fitness-coach) -- wedding-organizer & culinary-tour
// DIHAPUS dari daftar (bukan diganti placeholder) sampai gambarnya juga
// dibuat, supaya tidak ada kartu tanpa gambar asli di tengah showcase.
// Nama & jenis template tetap DIAMBIL dari QUICK_SETUP_TEMPLATES asli
// (konten jujur, template ini benar-benar ada di Quick Setup).
const CURATED: { key: string; image: string }[] = [
  { key: "fullstack-developer", image: "full-stack-developer.png" },
  { key: "book-author", image: "penulis-buku.png" },
  { key: "teacher", image: "guru.png" },
  { key: "freelancer", image: "freelancer-ui-ux.png" },
  { key: "online-store", image: "toko-online.png" },
  { key: "fitness-coach", image: "pelatih-fitness.png" },
];

const items = CURATED.map((c) => {
  const tmpl = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return { ...c, label: tmpl.label, description: tmpl.description };
});

export default function ProductShowcase() {
  const carouselRef = useRef<CarouselHandle>(null);
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden rounded-t-jsection border-t-2 border-[#111111] bg-jeon-lavender py-20 md:py-28" aria-label="Contoh halaman">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-[#111111] sm:text-5xl md:text-6xl">
              {t("productShowcase.heading1")}
              <br />
              <span className="text-jeon-purple-dark">{t("productShowcase.headingGradient")}</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {items.map((item) => (
            <div
              key={item.key}
              className="w-52 flex-shrink-0 scroll-snap-item transition-transform duration-150 hover:-translate-y-1 sm:w-60"
            >
              {/* next/image (audit performa 15 September 2026): tiap file di
                  public/homepage/product/ berukuran 1024x1536 (potret 2:3)
                  padahal kartunya cuma selebar w-52/sm:w-60 (208/240px) -- dan
                  6 gambar ini termuat sekaligus di carousel. Dimensi ASLI
                  dipakai di width/height demi rasio yang benar; `h-auto`
                  menemani `w-full` (alasan sama seperti Hero.tsx). `sizes` di-
                  hardcode 240px karena lebar kartu memang TETAP (w-52/w-60),
                  bukan persentase viewport -- carousel yang menggeser, bukan
                  kartunya yang melar. */}
              <Image
                src={`/homepage/product/${item.image}`}
                alt={item.label}
                width={1024}
                height={1536}
                sizes="240px"
                className="h-auto w-full rounded-jlg"
              />
              <div className="px-1 pt-3">
                <h3 className="font-display text-sm font-bold text-[#111111]">{item.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-[#111111]/60">{item.description}</p>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
