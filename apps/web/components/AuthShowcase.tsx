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
// Teks kutipan tetap PERNYATAAN NILAI PRODUK tanpa atribusi nama (keputusan
// lama dipertahankan: Jeonme belum punya testimoni pelanggan sungguhan
// untuk dikutip, jangan mengarang -- lihat riwayat komentar file ini).
export default function AuthShowcase() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 overflow-hidden py-12">
      {/* eslint-disable-next-line @next/next/no-img-element -- mockup lokal di public/, bukan gambar kreator */}
      <img
        src="/hero-joyful.png"
        alt="Contoh halaman jeon.id"
        className="w-[260px] flex-shrink-0"
      />

      <p className="max-w-md text-center font-display text-2xl font-bold leading-snug text-app-ink" style={{ textWrap: "balance" }}>
        &ldquo;<span className="text-jeon-purple">Satu halaman</span> untuk jualan produk digital, terima dukungan, dan kelola semua tautan kamu.&rdquo;
      </p>
    </div>
  );
}
