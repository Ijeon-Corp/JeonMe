// Dipersempit jadi 3 item -- permintaan langsung pengguna, 23 Agustus 2026:
// "hanya tampilkan ini saja di sebelah kiri nya Jual Produk Digital,
// Membership, Affiliator". Ikon SVG diganti gambar ilustrasi 3D yang
// disediakan pengguna langsung (permintaan susulan: "ganti icon dengan
// gambar yang sudah saya sediakan sesuai dengan nama gambarnya"),
// public/homepage/icon/*.png -- cocok nama file dengan label item.
const items = [
  { label: "Jual Produk Digital", image: "/homepage/icon/jual-produk-digital.png" },
  { label: "Membership", image: "/homepage/icon/membership.png" },
  { label: "Affiliator", image: "/homepage/icon/affiliator.png" },
];

export default function Monetization() {
  return (
    // bg-primary-subtle/40 -- permintaan langsung pengguna susulan, 23
    // Agustus 2026: "hapus background putih nya" (sebelumnya bg-white) --
    // pola sama seperti section Template/FAQ, memberi kontras lembut
    // supaya gambar monetization.png (yang PANELnya sendiri putih) tidak
    // menyatu datar dengan latar section.
    <section id="monetization" className="relative overflow-hidden bg-primary-subtle/40 py-20 md:py-28" aria-label="Monetisasi">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="reveal">
            <h2 className="mb-5 font-heading text-3xl font-bold leading-tight text-ink sm:text-4xl">
              Ubah Audiensmu
              <br />
              <span className="text-gradient">Menjadi Penghasilan</span>
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-muted">
              Aktifkan tools monetisasi yang kamu butuhkan, tanpa aplikasi tambahan, tanpa login berulang.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-white p-3.5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-card"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                  <p className="text-xs font-bold leading-snug text-ink">{item.label}</p>
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
