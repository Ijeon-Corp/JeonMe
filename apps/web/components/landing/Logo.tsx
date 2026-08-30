// Logo jeon.id -- permintaan langsung pengguna, 31 Agustus 2026: "gunakan
// logo baru jeon-logo-new untuk navbar dan sejenisnya". Menggantikan
// wordmark teks sementara dari Fase 2 redesign. Dua varian file:
//   - /jeon-logo-new.png      : wordmark HITAM (untuk latar terang)
//   - /jeon-logo-new-dark.png : wordmark PUTIH (digenerate dari file asli,
//     hanya piksel gelap area wordmark yang diputihkan -- ikon ungu tak
//     disentuh) untuk latar gelap.
// Ditampilkan berpasangan dengan class brand-logo-light/brand-logo-dark
// (globals.css, pola 3 lapis dark mode yang sama dengan token app-*) --
// yang tampil hanya satu sesuai tema aktif. Pemakai di latar gelap
// KONSTAN (sidebar dashboard/admin) tidak memakai komponen ini, langsung
// pakai file -dark.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/jeon-logo-new.png" alt="jeon.id" className="brand-logo-light h-9 w-auto" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/jeon-logo-new-dark.png" alt="jeon.id" className="brand-logo-dark h-9 w-auto" />
    </span>
  );
}
