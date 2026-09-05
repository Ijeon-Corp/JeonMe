import { IconCheck } from "@/components/icons";

// Panel visual kanan halaman /register & /login -- rework redesign Fase 3
// lanjutan (permintaan langsung pengguna, 31 Agustus 2026: "ubah juga login
// dan register nya sesuai tema"): gambar hero-v2.png (mockup identitas
// hijau lama) sempat diganti mockup mini-bio token-native murni CSS.
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "dibagian
// hero section ubah dibagian kanan gunakan gambar hero-joyful.png untuk di
// login dan juga register pakai gambar itu") -- mockup CSS DIGANTI gambar
// mockup foto asli public/hero-joyful.png (persona fiktif "Maya Lin", gaya
// sama dengan mockup public/homepage/product/* di ProductShowcase.tsx).
// Data pada gambar 100% fiktif.
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026, dengan
// tangkapan layar: "tambahkan teks atau yang lain nya supaya tidak sepi di
// bagian login dan register ini") -- gambar tunggal + kutipan menyisakan
// banyak ruang kosong di kiri/kanan/bawah. Ditambahkan 2 chip statistik
// mengambang (angka & posisi SAMA PERSIS dengan mockup CSS lama sebelum
// diganti gambar -- lihat riwayat git file ini -- dan SAMA dengan sisi
// belakang flip card Hero.tsx: "12.480"/"Rp2,4jt", supaya cerita fiktif
// Maya Lin konsisten lintas halaman) untuk mengisi ruang di sekitar
// gambar, plus daftar 3 manfaat singkat di bawah kutipan. Ketiga manfaat
// itu BUKAN klaim baru -- diambil kata-per-kata dari klaim yang sudah ada
// & diverifikasi sebelumnya: "tanpa kartu kredit" (FAQ pricing), "tautan
// tanpa batas" (Features.tsx "unlimitedLinks"), "jualan produk digital &
// terima dukungan" (subtitle form Daftar, register/page.tsx) -- BUKAN
// angka pengguna/kreator (spec redesign §11.2 sengaja melarang klaim
// jumlah kreator tanpa sumber terverifikasi).
// Teks kutipan tetap PERNYATAAN NILAI PRODUK tanpa atribusi nama (keputusan
// lama dipertahankan: Jeonme belum punya testimoni pelanggan sungguhan
// untuk dikutip, jangan mengarang -- lihat riwayat komentar file ini).
const BENEFITS = [
  "Gratis untuk mulai, tanpa kartu kredit",
  "Tautan & tema tanpa batas",
  "Jualan produk digital & terima dukungan",
];

export default function AuthShowcase() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-9 overflow-hidden py-12">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- mockup lokal di public/, bukan gambar kreator */}
        <img
          src="/hero-joyful.png"
          alt="Contoh halaman jeon.id"
          className="w-[260px] flex-shrink-0"
        />
        <div className="absolute -left-14 top-8 rounded-jmd border-2 border-jeon-ink bg-jeon-surface px-3.5 py-2 shadow-jsoft" aria-hidden="true">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jeon-muted">Kunjungan</p>
          <p className="font-display text-lg font-extrabold text-jeon-ink">12.480</p>
        </div>
        <div className="absolute -right-14 bottom-10 rounded-jmd border-2 border-[#111111] bg-jeon-sidebar px-3.5 py-2 shadow-jsoft" aria-hidden="true">
          <p className="text-[10px] font-bold uppercase tracking-wider text-jeon-lime">Penjualan</p>
          <p className="font-display text-lg font-extrabold text-white">Rp2,4jt</p>
        </div>
        <span className="absolute -top-6 right-2 select-none font-display text-2xl text-jeon-purple" aria-hidden="true">✦</span>
      </div>

      <p className="max-w-md text-center font-display text-2xl font-bold leading-snug text-app-ink" style={{ textWrap: "balance" }}>
        &ldquo;<span className="text-jeon-purple">Satu halaman</span> untuk jualan produk digital, terima dukungan, dan kelola semua tautan kamu.&rdquo;
      </p>

      <ul className="flex flex-col gap-2.5">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-center gap-2.5 text-sm font-semibold text-app-ink">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-jeon-ink bg-jeon-lime">
              <IconCheck className="h-3 w-3 text-[#111111]" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>
    </div>
  );
}
