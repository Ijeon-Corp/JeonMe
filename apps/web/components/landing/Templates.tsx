"use client";

import Image from "next/image";
import { useState } from "react";
import { QUICK_SETUP_TEMPLATES } from "@/lib/quick-setup-templates";
import { useLocale } from "@/lib/locale-context";

// Templates -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: "isinya di sesuaikan dengan tema dulu saja
// tidak usah pakai image dan icon yang sudah ada dari lama"): mockup
// <PagePreview> sungguhan + foto randomuser.me sempat diganti mockup
// stilistik murni CSS (skeleton per jenis layout).
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "untuk
// di section templates di homepage gunakan semua gambar yang ada di
// folder templates") -- skeleton CSS DIGANTI 8 gambar mockup foto asli
// public/homepage/templates/templates1-8.png (gaya sama dengan
// hero-joyful.png & public/homepage/product/*.png). Tiap gambar SUDAH
// mencantumkan label kategori + pil tag layout-nya sendiri di bagian
// bawah kartu (didesain sebagai satu kartu utuh, bukan foto polos) --
// jadi tidak perlu lagi footer <h3>/<p> terpisah seperti versi skeleton
// lama, cukup render gambarnya langsung.
//
// CATATAN TEKNIS: file PNG asli diekspor dengan latar checkerboard abu-
// abu OPAK (bukan transparan sungguhan, RGB bukan RGBA) -- diproses satu
// kali di sesi ini (chroma-key connected-component lewat scipy, bukan
// utilitas berulang di kode) supaya file yang disimpan di git SUDAH
// RGBA transparan, siap pakai langsung sebagai <img>.
//
// Cuma 8 dari 16 kategori kurasi lama yang punya gambar jadi (2 per tag
// layout, bukan 4) -- 8 SISANYA (content-creator/nightlife-venue/
// motivational-speaker/artist/coworking-space/food-beverage/
// mosque-community/photographer) DIHAPUS dari kurasi sampai gambarnya
// juga dibuat, pola sama seperti ProductShowcase.tsx (jangan campur
// gambar asli dengan placeholder di grid yang sama). Tag layout tiap
// kartu MENGIKUTI apa yang tercetak di gambarnya sendiri (kategorisasi
// visual marketing, independen dari layoutVariant teknis di
// quick-setup-templates.ts -- lihat catatan lama di
// QuickSetupTemplate.layoutVariant soal keduanya sengaja terpisah),
// BUKAN pengelompokan lama di kode ini (beberapa berubah, mis.
// event-organizer/nonprofit-charity sekarang "Spotlight" bukan "Cover",
// diving-center/adventure-guide sekarang "Masthead" bukan "Portrait").
// Section tint blue KONSTAN -- teks/outline ink konstan #111.
const CURATED_KEYS = [
  { key: "homestay-villa", tag: "Cover" as const, image: "templates1.png" },
  { key: "restaurant", tag: "Cover" as const, image: "templates2.png" },
  { key: "event-organizer", tag: "Spotlight" as const, image: "templates3.png" },
  { key: "nonprofit-charity", tag: "Spotlight" as const, image: "templates4.png" },
  { key: "dj", tag: "Portrait" as const, image: "templates5.png" },
  { key: "streamer", tag: "Portrait" as const, image: "templates6.png" },
  { key: "diving-center", tag: "Masthead" as const, image: "templates7.png" },
  { key: "adventure-guide", tag: "Masthead" as const, image: "templates8.png" },
];

const templates = CURATED_KEYS.map((c) => {
  const t = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return { key: c.key, label: t.label, tag: c.tag, image: c.image };
});

const filters = [
  { key: "all", labelKey: "all" },
  { key: "Cover", labelKey: "cover" },
  { key: "Portrait", labelKey: "portrait" },
  { key: "Spotlight", labelKey: "spotlight" },
  { key: "Masthead", labelKey: "masthead" },
] as const;

export default function Templates() {
  const [active, setActive] = useState<(typeof filters)[number]["key"]>("all");
  const visible = templates.filter((t) => active === "all" || t.tag === active);
  const { t: tr } = useLocale();

  return (
    // Section "story" biru KONSTAN (redesign spec §11.4) -- teks langsung
    // di atasnya ink konstan #111, lihat catatan di ProductShowcase.tsx.
    <section id="templates" className="relative overflow-hidden bg-jeon-blue py-20 md:py-28" aria-label="Template">
      <div className="relative mx-auto max-w-[var(--container)] px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto mb-10 max-w-3xl text-center">
          <h2 className="mb-4 font-display text-4xl font-extrabold leading-[0.95] tracking-tight text-[#111111] sm:text-5xl md:text-6xl">
            {tr("templates.heading1")}
            <br />
            <span className="text-jeon-purple-dark">{tr("templates.headingGradient")}</span>
          </h2>
          <p className="text-lg leading-relaxed text-[#111111]/70">{tr("templates.subtitle")}</p>
        </div>

        <div className="reveal mb-10 flex flex-wrap justify-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`cursor-pointer rounded-full border-2 border-[#111111] px-4 py-2 text-sm font-bold transition-colors ${
                active === f.key ? "bg-[#111111] text-white" : "bg-white text-[#111111] hover:bg-jeon-lavender"
              }`}
            >
              {tr(`templates.filters.${f.labelKey}`)}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((t) => (
            <div key={t.key} className="reveal cursor-pointer transition-transform duration-150 hover:-translate-y-1">
              {/* next/image (audit performa 15 September 2026): 8 file
                  templates*.png masing-masing 1254x1254 (RGBA transparan, lihat
                  CATATAN TEKNIS di atas) padahal sel grid-nya paling lebar ~300px
                  -- dan sampai 8 gambar ini bisa tampil sekaligus saat filter
                  "all". Semuanya BUJUR SANGKAR, jadi width=height=1254 aman
                  dipakai seragam. `h-auto` menemani `w-full` dengan alasan sama
                  seperti di Hero.tsx. `sizes` mengikuti grid di atas:
                  1 kolom (<640px) -> ~100vw, 2 kolom (sm) -> ~50vw,
                  4 kolom (lg) -> ~25vw, dibatasi lebar container. */}
              <Image
                src={`/homepage/templates/${t.image}`}
                alt={`${t.label} (${t.tag})`}
                width={1254}
                height={1254}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="h-auto w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
