import { IconCheck } from "@/components/icons";

// Panel visual kanan halaman /register & /login -- rework redesign Fase 3
// lanjutan (permintaan langsung pengguna, 31 Agustus 2026: "ubah juga login
// dan register nya sesuai tema"): gambar hero-v2.png (mockup identitas
// hijau lama) sempat diganti mockup mini-bio token-native murni CSS.
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "dibagian
// hero section ubah dibagian kanan gunakan gambar hero-joyful.png untuk di
// login dan juga register pakai gambar itu") -- mockup CSS DIGANTI gambar
// mockup foto asli public/hero-joyful.png, lalu ditambah 2 chip statistik
// mengambang murni CSS + daftar 3 manfaat singkat di bawah kutipan supaya
// tidak sepi (tangkapan layar pengguna hari yang sama).
//
// Direvisi lagi (permintaan langsung pengguna, 6 September 2026: "juga
// untuk login register dll ubah menggunakan gambar hero.png yang ada di
// folder homepage") -- hero-joyful.png DIGANTI public/homepage/hero.png
// (gambar yang sama dipakai Hero.tsx homepage, persona sama "Maya Lin").
// Chip statistik CSS manual (Kunjungan/Penjualan) DIHAPUS -- gambar baru
// ini SUDAH punya chip mengambangnya sendiri baked-in (Kreator
// berkembang/24 produk terjual/BARU/+1.248 klik hari ini/Dipakai 50K+
// kreator), menambah chip terpisah lagi di atasnya jadi duplikat/ramai.
// Daftar manfaat teks tetap dipertahankan (bukan sesuatu yang sudah ada
// di gambar). Data pada gambar 100% fiktif KECUALI badge "Dipakai 50K+
// kreator" -- dikonfirmasi eksplisit ke pengguna (AskUserQuestion, sama
// hari) sebagai angka yang sengaja dipasang apa adanya, lihat catatan
// lengkap soal ini di Hero.tsx (komentar file yang sama persis dipakai
// gambar ini).
// Ketiga manfaat teks BUKAN klaim baru -- diambil kata-per-kata dari
// klaim yang sudah ada & diverifikasi sebelumnya: "tanpa kartu kredit"
// (FAQ pricing), "tautan tanpa batas" (Features.tsx "unlimitedLinks"),
// "jualan produk digital & terima dukungan" (subtitle form Daftar,
// register/page.tsx).
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
      {/* eslint-disable-next-line @next/next/no-img-element -- mockup lokal di public/, bukan gambar kreator */}
      <img
        src="/homepage/hero.png"
        alt="Contoh halaman jeon.id -- bio, konten, dan statistik kreator dalam satu tautan"
        className="w-full max-w-md"
      />

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
