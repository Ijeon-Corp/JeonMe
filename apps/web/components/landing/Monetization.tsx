"use client";

import { useLocale } from "@/lib/locale-context";

// Dipersempit jadi 3 item -- permintaan langsung pengguna, 23 Agustus 2026:
// "hanya tampilkan ini saja di sebelah kiri nya Jual Produk Digital,
// Membership, Affiliator". Ikon SVG diganti gambar ilustrasi 3D yang
// disediakan pengguna langsung (permintaan susulan: "ganti icon dengan
// gambar yang sudah saya sediakan sesuai dengan nama gambarnya"),
// public/homepage/icon/*.png -- cocok nama file dengan label item.
//
// "hosting" -- item ke-4, permintaan langsung pengguna, 29 Agustus 2026:
// "tambahkan 1 lagi dibagian monetization 'hosting murah dan berkualitas'".
// Belum ada gambar ilustrasi 3D yang cocok (pola 3 item lain) -- pengguna
// memilih pakai ikon SVG server sementara (bukan menunggu gambar dulu),
// gampang diganti `image` PNG kapan pun asetnya siap (tinggal hapus field
// `icon` & isi `image`, lihat percabangan render di bawah).
const items = [
  { key: "sellDigitalProducts" as const, image: "/homepage/icon/jual-produk-digital.png" },
  { key: "membership" as const, image: "/homepage/icon/membership.png" },
  { key: "affiliator" as const, image: "/homepage/icon/affiliator.png" },
  {
    key: "hosting" as const,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-primary" aria-hidden="true">
        <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
        <circle cx="7" cy="17" r="1" fill="currentColor" />
        <path d="M11 7h7M11 17h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Monetization() {
  const { t } = useLocale();

  return (
    // bg-app-surface-2 (BUKAN bg-primary-subtle/40) -- lihat catatan
    // lengkap soal token app-* vs bg-primary-subtle di ProductShowcase.tsx.
    <section id="monetization" className="relative overflow-hidden bg-app-surface-2 py-20 md:py-28" aria-label="Monetisasi">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
            <h2 className="mb-5 font-heading text-3xl font-bold leading-tight text-app-ink sm:text-4xl">
              {t("monetization.heading1")}
              <br />
              <span className="text-gradient">{t("monetization.headingGradient")}</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-app-muted">{t("monetization.subtitle")}</p>

            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center gap-2.5 rounded-xl border border-app-border bg-app-surface p-3.5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-card"
                >
                  {"image" in item ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                  ) : (
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle">{item.icon}</span>
                  )}
                  <p className="text-xs font-bold leading-snug text-app-ink">{t(`monetization.items.${item.key}`)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="reveal flex justify-center lg:justify-end" style={{ transitionDelay: "0.15s" }}>
            {/* Mockup dashboard pendapatan -- permintaan langsung pengguna,
                23 Agustus 2026: "ganti gambar disampingnya dengan gambar
                monetization.png". SEBELUMNYA dashboard pendapatan dibangun
                manual dari puluhan div/SVG (lihat riwayat git kalau perlu
                versi lama itu) -- diganti satu file gambar
                (public/homepage/monetization.png), pola yang SAMA seperti
                penggantian mockup Hero.tsx (hero.png, lihat catatan sama di
                sana). max-w-lg (naik dari max-w-sm) & animate-float --
                permintaan susulan: "buat lebih besar... buat ada animasi
                bergerak", animate-float SAMA PERSIS kelas yang dipakai
                mockup Hero.tsx (lihat tailwind.config.ts) supaya gerakan
                mengambangnya konsisten dengan section lain. Tanpa shadow/
                rounded tambahan di sini -- monetization.png (seperti
                hero.png) sudah punya bayangannya sendiri dibakar ke
                gambar, shadow CSS ekstra cuma menumpuk jadi ganda. */}
            <div className="animate-float w-full max-w-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/homepage/monetization.png" alt="Dashboard pendapatan & monetisasi Jeon.id" className="w-full object-contain" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
