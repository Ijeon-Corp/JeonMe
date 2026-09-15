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
//
// next/image dgn width/height TETAP (audit performa 15 September 2026): dua file
// PNG aslinya 2048x768 padahal SELALU dirender setinggi 36px saja (h-9) -- ini
// logo yang ikut termuat di HAMPIR SETIAP halaman, jadi selisihnya nyata.
// 128x48 dipilih karena rasionya PERSIS 2048:768 (8:3) -- yang menentukan lebar
// TAMPIL tetap CSS `h-9 w-auto` seperti sebelumnya (tidak ada perubahan visual),
// pasangan angka ini cuma memberi tahu browser rasio intrinsiknya + membatasi
// srcset yang dibangkitkan. Angka 128x48 yang SAMA dipakai di semua tempat logo
// ini muncul (dashboard/layout.tsx, admin/layout.tsx, builder/[pageId]/page.tsx)
// meski tinggi CSS-nya beda-beda (h-5/h-7/h-8/h-9) -- justru itu intinya: rasio
// yang sama, tinggi diatur CSS. `fill` TIDAK dipakai: pembungkusnya <span>
// inline-flex tanpa tinggi tetap, ukuran logo justru ditentukan gambarnya
// sendiri, bukan sebaliknya.
import Image from "next/image";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <Image src="/jeon-logo-new.png" alt="jeon.id" width={128} height={48} className="brand-logo-light h-9 w-auto" />
      <Image src="/jeon-logo-new-dark.png" alt="jeon.id" width={128} height={48} className="brand-logo-dark h-9 w-auto" />
    </span>
  );
}
