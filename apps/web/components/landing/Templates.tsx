"use client";

import { useState } from "react";
import PagePreview from "@/components/PagePreview";
import { QUICK_SETUP_TEMPLATES, buildQuickSetupPreviewData } from "@/lib/quick-setup-templates";

// Templates -- dirender pakai KOMPONEN PagePreview SUNGGUHAN (sama persis
// dipakai halaman publik & dashboard Quick Setup, lihat
// buildQuickSetupPreviewData) supaya bio/tautan/blok yang tampil di sini
// benar-benar isi template itu, bukan mockup buatan tangan. Nama & foto
// profil dummy (randomuser.me -- layanan publik foto wajah acak, bebas
// dipakai tanpa API key) karena template belum terpasang ke akun
// sungguhan mana pun.
//
// Struktur 4 baris x 4 kolom -- permintaan langsung pengguna, 24 Agustus
// 2026: "tiap baris saya mau jenis layout yang sama tapi isinya berbeda...
// karna ini ada 4 baris berarti ada 4 jenis layout". SEBELUMNYA 16 template
// dikurasi HANYA dari yang bertema wallpaper/video (layoutVariant tercampur
// acak per kartu) -- sekarang dikurasi per BARIS: satu layoutVariant yang
// SAMA utk keempat kartu dalam satu baris (array ini diurutkan 4-4-4-4,
// grid 4 kolom otomatis membariskannya benar tanpa logika render
// tambahan), isi/tema BEDA-BEDA di dalam baris itu. Dipilih 4 dari 15
// layoutVariant yang punya kandidat TERKAYA (link+blok terbanyak) --
// permintaan susulan lain: "isi dari tiap template itu blok nya banyakin
// saja dan penuhin jangan hanya 1 blok saja karna tampilan nya jelek".
// Konsekuensinya: TIDAK semua 16 lagi bertema wallpaper/video foto asli
// (cuma cukup kandidat kaya-konten di sebagian layout) -- 7 dari 16 tetap
// wallpaper/video, sisanya gradien CSS yang juga rich, SEMUA 16 tema
// beda-beda (nol duplikasi aset visual, lebih baik dari kurasi sebelumnya
// yang masih terima 1 pasang kembar). Tema "electric" (video neon
// segitiga, dipakai gamer & gym-fitness-center) SENGAJA tidak dipakai
// SAMA SEKALI lagi -- keluhan langsung pengguna: "saya mau ubah bg yang
// tema game jadi yang lain" (gym-fitness-center masih mewarisi video
// neon bekas Gamer, kelihatan seperti tema gaming padahal personanya gym).
//
// Revisi 27 Agustus 2026 (permintaan langsung pengguna: "jangan tampilkan
// quick template dengan tipe header hero dan juga background gamer atau
// kayu"): baris "Hero" (layoutVariant "hero" -- foto profil besar
// edge-to-edge) DIGANTI SELURUHNYA jadi baris "Cover" (layoutVariant
// "cover" -- foto sampul lanskap penuh di atas, avatar bulat menumpuk di
// bawahnya). Tema "kraft" (dipakai batik-craft) juga tetap TIDAK pernah
// dipakai di kurasi ini -- sama seperti "electric" di atas, dicek ulang
// supaya tidak kebawa lagi kalau daftar Quick Setup bertambah ke depannya.
//
// Revisi 28 Agustus 2026 (permintaan langsung pengguna: "ganti template
// electric dan ember yang ada di home page dengan template lain"): tema
// "electric" MEMANG sudah tidak dipakai sama sekali sejak revisi di atas
// (gamer/gym-fitness-center tidak pernah masuk kurasi ini). Tema "ember"
// SEMPAT terpakai lewat "musician" (baris Portrait) -- diganti "dj"
// (tema "downtown", layoutVariant "portrait" juga, kategori entertainment
// sama seperti musician) supaya baris Portrait tetap 4 tema yang
// benar-benar berbeda tanpa "ember" ataupun "electric".
const CURATED_KEYS = [
  // Baris 1 -- layout "cover" (foto sampul lanskap + avatar bulat menumpuk).
  { key: "restaurant", tag: "Cover" as const, displayName: "Bagus Prasetyo", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg" },
  { key: "homestay-villa", tag: "Cover" as const, displayName: "Ratna Dewi", avatarUrl: "https://randomuser.me/api/portraits/women/32.jpg" },
  { key: "event-organizer", tag: "Cover" as const, displayName: "Dimas Wirawan", avatarUrl: "https://randomuser.me/api/portraits/men/91.jpg" },
  { key: "nonprofit-charity", tag: "Cover" as const, displayName: "Sari Wulandari", avatarUrl: "https://randomuser.me/api/portraits/women/54.jpg" },
  // Baris 2 -- layout "portrait" (foto tegak dibingkai & berbayang ala poster).
  { key: "dj", tag: "Portrait" as const, displayName: "Reza Firmansyah", avatarUrl: "https://randomuser.me/api/portraits/men/72.jpg" },
  { key: "streamer", tag: "Portrait" as const, displayName: "Vanya Kirana", avatarUrl: "https://randomuser.me/api/portraits/women/61.jpg" },
  { key: "diving-center", tag: "Portrait" as const, displayName: "Nabila Putri", avatarUrl: "https://randomuser.me/api/portraits/women/23.jpg" },
  { key: "adventure-guide", tag: "Portrait" as const, displayName: "Bianca Alves", avatarUrl: "https://randomuser.me/api/portraits/women/17.jpg" },
  // Baris 3 -- layout "spotlight" (avatar besar + badge nama).
  { key: "content-creator", tag: "Spotlight" as const, displayName: "Salsa Amelia", avatarUrl: "https://randomuser.me/api/portraits/women/79.jpg" },
  { key: "nightlife-venue", tag: "Spotlight" as const, displayName: "Marco Rossi", avatarUrl: "https://randomuser.me/api/portraits/men/12.jpg" },
  { key: "motivational-speaker", tag: "Spotlight" as const, displayName: "Grace Tanuwijaya", avatarUrl: "https://randomuser.me/api/portraits/women/36.jpg" },
  { key: "artist", tag: "Spotlight" as const, displayName: "Yusuf Ibrahim", avatarUrl: "https://randomuser.me/api/portraits/men/19.jpg" },
  // Baris 4 -- layout "masthead" (pita warna berisi identitas langsung di dalamnya).
  { key: "coworking-space", tag: "Masthead" as const, displayName: "Clarissa Wijaya", avatarUrl: "https://randomuser.me/api/portraits/women/48.jpg" },
  { key: "food-beverage", tag: "Masthead" as const, displayName: "Rizky Pratama", avatarUrl: "https://randomuser.me/api/portraits/men/76.jpg" },
  { key: "mosque-community", tag: "Masthead" as const, displayName: "Faisal Rahman", avatarUrl: "https://randomuser.me/api/portraits/men/67.jpg" },
  { key: "photographer", tag: "Masthead" as const, displayName: "Hana Kobayashi", avatarUrl: "https://randomuser.me/api/portraits/women/26.jpg" },
];

const templates = CURATED_KEYS.map((c) => {
  const t = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return {
    key: c.key,
    label: t.label,
    tag: c.tag,
    data: buildQuickSetupPreviewData(t, c.key.replace(/-/g, ""), c.displayName, c.avatarUrl),
  };
});

const filters = [
  { key: "all", label: "Semua" },
  { key: "Cover", label: "Cover" },
  { key: "Portrait", label: "Portrait" },
  { key: "Spotlight", label: "Spotlight" },
  { key: "Masthead", label: "Masthead" },
] as const;

export default function Templates() {
  const [active, setActive] = useState<(typeof filters)[number]["key"]>("all");
  const visible = templates.filter((t) => active === "all" || t.tag === active);

  return (
    <section id="templates" className="relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Template">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mx-auto mb-10 max-w-2xl text-center">
          <h2 className="mb-4 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
            Mulai dari
            <br />
            <span className="text-gradient">Template yang Indah</span>
          </h2>
          <p className="text-lg leading-relaxed text-muted">Pilih dari puluhan template siap pakai, sesuaikan dalam hitungan menit, dan publikasikan halamanmu sendiri.</p>
        </div>

        <div className="reveal mb-10 flex flex-wrap justify-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActive(f.key)}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active === f.key
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-muted hover:border-primary hover:text-primary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((t) => (
            <div
              key={t.key}
              className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card"
            >
              {/* Mockup PagePreview SUNGGUHAN, dizoom kecil -- pola SAMA
                  PERSIS dengan galeri /dashboard/quick-setup (lihat catatan
                  lengkap di buildQuickSetupPreviewData). pointer-events-none
                  -- mockup MURNI visual, kartu ini tidak punya link tujuan
                  (beda dari quick-setup yang buka modal saat diklik).
                  hideFooterChrome -- footer platform (watermark "Buat
                  halaman gratis di Jeon.id" + Preferensi Cookie/Laporkan/
                  Privasi/dst) yang biasanya SELALU tampil di pratinjau
                  dashboard jadi teks kecil tak terbaca & berantakan di
                  thumbnail sekecil ini, dipotong khusus di sini (lihat
                  prop-nya, PagePreview.tsx). */}
              <div className="relative h-[26rem] w-full overflow-hidden bg-white pointer-events-none" aria-hidden="true">
                <div className="h-full [zoom:0.5]">
                  <PagePreview interactive={false} rootClassName="min-h-full" data={t.data} hideFooterChrome />
                </div>
                {/* Fade bawah -- tanpa ini, tautan/blok terakhir yang tidak
                    muat di kotak ini terpotong MENTAH di tengah kalimat.
                    Konten asli tetap beda panjang per template (walau kini
                    dikurasi supaya sama-sama kaya blok), fade ini
                    menyamarkan garis potong itu jadi transisi halus ke
                    area putih judul kartu di bawahnya, apa pun warna latar
                    tema (gelap/terang) di baliknya. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-ink/70 opacity-0 transition-opacity duration-250 group-hover:opacity-100">
                <span className="rounded-full bg-white px-4 py-2 text-xs font-bold text-ink">Lihat Template</span>
              </div>
              <div className="p-4">
                <h3 className="font-heading text-sm font-bold text-ink">{t.label}</h3>
                <p className="mt-0.5 text-xs text-muted">{t.tag}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
