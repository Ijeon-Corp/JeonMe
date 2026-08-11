// Panel visual kanan halaman /register & /login -- permintaan langsung
// pengguna, 11 Agustus 2026: ganti mockup JSX buatan tangan (telepon +
// kartu mengambang) dengan satu file gambar (image1.png) yang dioper
// pengguna langsung, bukan direplikasi lagi lewat markup.
export default function AuthShowcase() {
  return (
    <div className="flex h-full flex-col justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/image1.png" alt="Pratinjau halaman bio & dashboard Jeonme" className="w-full max-w-xl object-contain" />
    </div>
  );
}
