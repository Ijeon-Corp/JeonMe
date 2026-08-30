"use client";

import { useState } from "react";
import { QUICK_SETUP_TEMPLATES } from "@/lib/quick-setup-templates";
import { useLocale } from "@/lib/locale-context";

// Templates -- rework konten Fase 2 lanjutan (permintaan langsung
// pengguna, 31 Agustus 2026: "isinya di sesuaikan dengan tema dulu saja
// tidak usah pakai image dan icon yang sudah ada dari lama"): mockup
// <PagePreview> sungguhan + foto randomuser.me DIGANTI mockup stilistik
// dari token redesign. Struktur kurasi LAMA dipertahankan (permintaan
// pengguna 24-28 Agustus 2026 yang masih berlaku: 4 baris x 4 kolom,
// tiap baris satu jenis layout yang sama, nama template DIAMBIL dari
// QUICK_SETUP_TEMPLATES asli) -- tiap tag layout digambar sebagai
// skeleton mini yang BENTUKNYA berbeda (Cover: pita sampul + avatar
// menumpuk; Portrait: foto tegak berbingkai; Spotlight: avatar besar +
// badge; Masthead: pita identitas selebar penuh) supaya konsep "4 jenis
// layout" tetap terbaca tanpa merender PagePreview. Bonus: PagePreview
// tidak lagi terbundel di halaman marketing (target performa spec §21).
// Section tint blue KONSTAN -- teks/outline ink konstan #111.
const ACCENTS = ["bg-jeon-purple", "bg-jeon-coral", "bg-jeon-lime", "bg-jeon-pink"];

const CURATED_KEYS = [
  { key: "restaurant", tag: "Cover" as const },
  { key: "homestay-villa", tag: "Cover" as const },
  { key: "event-organizer", tag: "Cover" as const },
  { key: "nonprofit-charity", tag: "Cover" as const },
  { key: "dj", tag: "Portrait" as const },
  { key: "streamer", tag: "Portrait" as const },
  { key: "diving-center", tag: "Portrait" as const },
  { key: "adventure-guide", tag: "Portrait" as const },
  { key: "content-creator", tag: "Spotlight" as const },
  { key: "nightlife-venue", tag: "Spotlight" as const },
  { key: "motivational-speaker", tag: "Spotlight" as const },
  { key: "artist", tag: "Spotlight" as const },
  { key: "coworking-space", tag: "Masthead" as const },
  { key: "food-beverage", tag: "Masthead" as const },
  { key: "mosque-community", tag: "Masthead" as const },
  { key: "photographer", tag: "Masthead" as const },
];

const templates = CURATED_KEYS.map((c, i) => {
  const t = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return { key: c.key, label: t.label, tag: c.tag, accent: ACCENTS[i % 4] };
});

const filters = [
  { key: "all", labelKey: "all" },
  { key: "Cover", labelKey: "cover" },
  { key: "Portrait", labelKey: "portrait" },
  { key: "Spotlight", labelKey: "spotlight" },
  { key: "Masthead", labelKey: "masthead" },
] as const;

// Skeleton mini per jenis layout -- murni dekoratif (aria-hidden di
// pemanggil), bentuk tiap varian meniru ciri khas layout aslinya.
function LayoutSkeleton({ tag, accent }: { tag: (typeof CURATED_KEYS)[number]["tag"]; accent: string }) {
  const pill = <span className="h-7 w-full rounded-jsm border-2 border-[#111111] bg-white" />;
  switch (tag) {
    case "Cover":
      return (
        <div className="flex flex-col px-4 pt-4">
          <div className={`h-16 w-full rounded-jmd border-2 border-[#111111] ${accent}`} />
          <span className="-mt-5 ml-4 h-10 w-10 rounded-full border-2 border-[#111111] bg-white" />
          <span className="mt-2 h-2 w-20 rounded-full bg-[#111111]/80" />
          <div className="mt-3 flex flex-col gap-2">{pill}{pill}</div>
        </div>
      );
    case "Portrait":
      return (
        <div className="flex flex-col items-center px-4 pt-4">
          <div className={`h-24 w-20 rotate-2 rounded-jmd border-2 border-[#111111] ${accent} shadow-[4px_4px_0_rgba(17,17,17,0.9)]`} />
          <span className="mt-3 h-2 w-20 rounded-full bg-[#111111]/80" />
          <div className="mt-3 flex w-full flex-col gap-2">{pill}{pill}</div>
        </div>
      );
    case "Spotlight":
      return (
        <div className="flex flex-col items-center px-4 pt-4">
          <span className={`h-16 w-16 rounded-full border-2 border-[#111111] ${accent}`} />
          <span className="mt-2 rounded-full border-2 border-[#111111] bg-white px-3 py-0.5 text-[9px] font-bold text-[#111111]">✦</span>
          <div className="mt-3 flex w-full flex-col gap-2">{pill}{pill}</div>
        </div>
      );
    case "Masthead":
      return (
        <div className="flex flex-col px-4 pt-4">
          <div className={`flex items-center gap-2 rounded-jmd border-2 border-[#111111] ${accent} p-2.5`}>
            <span className="h-8 w-8 flex-shrink-0 rounded-full border-2 border-[#111111] bg-white" />
            <span className="h-2 w-16 rounded-full bg-white/90" />
          </div>
          <div className="mt-3 flex flex-col gap-2">{pill}{pill}</div>
        </div>
      );
  }
}

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
            <div
              key={t.key}
              className="reveal group flex cursor-pointer flex-col overflow-hidden rounded-jlg border-2 border-[#111111] bg-[#f5f1e8] shadow-[10px_12px_0_rgba(17,17,17,0.92)] transition-transform duration-150 hover:-translate-y-1"
            >
              <div className="pb-4 pointer-events-none" aria-hidden="true">
                <LayoutSkeleton tag={t.tag} accent={t.accent} />
              </div>
              <div className="mt-auto border-t-2 border-[#111111] bg-white p-4">
                <h3 className="font-display text-sm font-bold text-[#111111]">{t.label}</h3>
                <p className="mt-0.5 text-xs text-[#111111]/60">{t.tag}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
