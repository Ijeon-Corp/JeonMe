// Panel visual kanan halaman /register & /login -- permintaan langsung
// pengguna, 11 Agustus 2026: ganti mockup JSX buatan tangan (telepon +
// kartu mengambang) dengan satu file gambar (image1.png) yang dioper
// pengguna langsung, bukan direplikasi lagi lewat markup.
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
      <img src="/image1.png" alt="Pratinjau halaman bio & dashboard Jeonme" className="w-full max-w-xl object-contain" />
      <p className="max-w-md text-center font-heading text-2xl font-bold leading-snug text-ink" style={{ textWrap: "balance" }}>
        &ldquo;<span className="text-primary">Satu halaman</span> untuk jualan produk digital, terima dukungan, dan kelola semua tautan kamu.&rdquo;
      </p>
    </div>
  );
}
