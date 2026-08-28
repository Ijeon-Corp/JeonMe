"use client";

import { useRef } from "react";
import Carousel, { CarouselArrows, type CarouselHandle } from "./Carousel";
import PagePreview from "@/components/PagePreview";
import { QUICK_SETUP_TEMPLATES, buildQuickSetupPreviewData } from "@/lib/quick-setup-templates";

// items -- permintaan langsung pengguna, 28 Agustus 2026: "ganti semua isi
// product showcase pakai template di quick setup yang tema nya bagus bagus
// seperti contoh nya yang fullstack web developer". SEBELUMNYA 6 mockup
// buatan tangan (kotak gradien + 3 balok abu-abu placeholder, BUKAN isi
// sungguhan apa pun) -- sekarang dirender pakai KOMPONEN PagePreview
// SUNGGUHAN persis seperti Templates.tsx di bawah section ini (lihat
// catatan lengkap di sana soal kenapa PagePreview asli, bukan mockup
// tangan). "fullstack-developer" dipertahankan sesuai contoh yang diminta
// pengguna, 5 lainnya dipilih beda dari 16 kunci yang sudah dipakai
// Templates.tsx (CURATED_KEYS di file itu) supaya kreator yang scroll ke
// bawah TIDAK melihat template yang sama dua kali berturut-turut, sambil
// tetap mencakup ragam persona yang mirip susunan lama (kreator, developer,
// kelas, freelancer, toko, coach) + 2 tambahan (wedding organizer, travel
// agency) supaya carousel ini terasa penuh dengan 8 kartu.
//
// Revisi susulan (permintaan langsung pengguna): "ganti template dengan
// layout hero dengan yang lain ganti 2 itu dan juga course creator yang
// warna bg kuning ini dengan yang lain" -- "influencer" & "travel-agency"
// (keduanya layoutVariant "hero") diganti "book-author"/"culinary-tour",
// dan "course-creator" (tema "golden", latar kekuningan) diganti "teacher"
// (tema "ocean", biru). Ketiga pengganti sengaja dipilih dengan
// layoutVariant & tema yang BEDA dari 5 kartu yang tidak berubah (spotlight/
// banner/card/duo/ticket, console/forest/peach/dune/champagne) supaya
// kedelapan kartu tetap tidak ada yang kembar layout maupun temanya.
const CURATED_KEYS = [
  { key: "fullstack-developer", displayName: "Dimas Aditya", avatarUrl: "https://randomuser.me/api/portraits/men/34.jpg" },
  { key: "book-author", displayName: "Rian Saputra", avatarUrl: "https://randomuser.me/api/portraits/men/45.jpg" },
  { key: "teacher", displayName: "Sinta Nuraini", avatarUrl: "https://randomuser.me/api/portraits/women/28.jpg" },
  { key: "freelancer", displayName: "Farah W.", avatarUrl: "https://randomuser.me/api/portraits/women/65.jpg" },
  { key: "online-store", displayName: "Toko Senja", avatarUrl: "https://randomuser.me/api/portraits/women/50.jpg" },
  { key: "fitness-coach", displayName: "Coach Budi", avatarUrl: "https://randomuser.me/api/portraits/men/58.jpg" },
  { key: "wedding-organizer", displayName: "Amara Wedding", avatarUrl: "https://randomuser.me/api/portraits/women/41.jpg" },
  { key: "culinary-tour", displayName: "Jelajah Nusantara", avatarUrl: "https://randomuser.me/api/portraits/men/22.jpg" },
] as const;

const items = CURATED_KEYS.map((c) => {
  const t = QUICK_SETUP_TEMPLATES.find((x) => x.key === c.key)!;
  return {
    key: c.key,
    label: t.label,
    description: t.description,
    data: buildQuickSetupPreviewData(t, c.key.replace(/-/g, ""), c.displayName, c.avatarUrl),
  };
});

export default function ProductShowcase() {
  const carouselRef = useRef<CarouselHandle>(null);

  return (
    <section className="dot-grid relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Contoh halaman">
      <div
        className="absolute inset-0 opacity-[0.5]"
        aria-hidden="true"
        style={{ maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)" }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="reveal mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-xl">
            <h2 className="font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Satu Halaman untuk Setiap
              <br />
              <span className="text-gradient">Jenis Kreator</span>
            </h2>
          </div>
          <CarouselArrows carouselRef={carouselRef} />
        </div>

        <Carousel ref={carouselRef}>
          {items.map((item) => (
            <div
              key={item.key}
              className="tilt-card w-56 flex-shrink-0 scroll-snap-item overflow-hidden rounded-3xl border border-border bg-white shadow-card"
            >
              {/* Mockup PagePreview SUNGGUHAN, dizoom kecil -- pola & ukuran
                  SAMA PERSIS dengan galeri Templates.tsx di bawah section
                  ini (h-[26rem] + zoom:0.5 -- 448px lebar asli PagePreview
                  jadi 224px, pas dengan lebar kartu w-56 tanpa sisa
                  ruang kosong di kiri/kanan). pointer-events-none -- mockup
                  MURNI visual, kartu ini tidak punya link tujuan. */}
              <div className="relative h-[26rem] w-full overflow-hidden bg-white pointer-events-none" aria-hidden="true">
                <div className="h-full [zoom:0.5]">
                  <PagePreview interactive={false} rootClassName="min-h-full" data={item.data} hideFooterChrome />
                </div>
                {/* Fade bawah -- konten template panjangnya beda-beda,
                    menyamarkan garis potong di tengah kalimat jadi transisi
                    halus ke area putih judul kartu (lihat catatan sama di
                    Templates.tsx). */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
              </div>
              <div className="p-5 pt-3">
                <h3 className="font-heading text-sm font-bold text-ink">{item.label}</h3>
                <p className="mt-1 text-xs text-muted">{item.description}</p>
              </div>
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}
