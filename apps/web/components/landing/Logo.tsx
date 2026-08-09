// Logo -- permintaan langsung pengguna, 10 Agustus 2026: ganti seluruh
// logo di app (ikon+teks bikinan sendiri) jadi satu file gambar
// logo-baru.png. Dipakai di Navbar & Footer landing (keduanya
// berbackground putih -- warna hijau tua logo kontras cukup di situ,
// beda dengan sidebar dashboard/admin yang butuh chip putih, lihat
// catatan di app/dashboard/layout.tsx & app/admin/layout.tsx).
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-baru.png" alt="Jeonme" className={`h-9 w-auto ${className}`} />
  );
}
