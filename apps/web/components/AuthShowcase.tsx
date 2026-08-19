// Panel visual kanan halaman /register & /login -- permintaan langsung
// pengguna, 11 Agustus 2026: ganti mockup JSX buatan tangan (telepon +
// kartu mengambang) dengan satu file gambar yang dioper pengguna langsung,
// bukan direplikasi lagi lewat markup. File-nya di-rename pengguna dari
// image1.png jadi hero.png (20 Agustus 2026, dipakai bareng
// components/landing/Hero.tsx yang sekarang juga memakai file yang sama)
// -- src di bawah WAJIB ikut disesuaikan, path lama sudah tidak ada lagi
// di public/ (referensi basi = gambar 404 diam-diam).
// Teks kutipan di bawah gambar -- permintaan langsung pengguna dengan
// referensi tangkapan layar halaman Beacons.ai (kutipan tebal + atribusi
// nama pelanggan & URL toko mereka). Gaya visual (kutipan besar tebal,
// terpusat) DITIRU, tapi ISI-nya SENGAJA BUKAN testimoni pelanggan
// bernama seperti referensi -- Jeonme belum punya testimoni pelanggan
// sungguhan untuk dikutip, jadi pakai pernyataan nilai produk saja tanpa
// atribusi nama/akun fiktif (pola yang sama seperti keputusan sebelumnya
// di file ini soal tidak meniru testimoni+angka pendapatan referensi).
export default function AuthShowcase() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero.png" alt="Pratinjau halaman bio & dashboard Jeon.id" className="w-full max-w-xl object-contain" />
      <p className="max-w-md text-center font-heading text-2xl font-bold leading-snug text-ink" style={{ textWrap: "balance" }}>
        &ldquo;<span className="text-primary">Satu halaman</span> untuk jualan produk digital, terima dukungan, dan kelola semua tautan kamu.&rdquo;
      </p>
    </div>
  );
}
