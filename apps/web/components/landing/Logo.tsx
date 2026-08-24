// Logo -- permintaan langsung pengguna, 24 Agustus 2026: "di navbar dan
// footer pakai logo.png". SEBELUMNYA pakai logo-baru.png (wordmark "im"
// bergaya glow di LATAR HITAM) -- kotak hitam solid itu tampil aneh di
// Navbar & Footer landing yang keduanya berbackground putih (bug visual
// nyata, bukan cuma preferensi). logo.png berlatar TRANSPARAN & memuat
// wordmark "jeon.id" penuh, jadi lebih cocok dipakai di sini. Dipakai
// khusus di Navbar & Footer landing (scope permintaan pengguna) --
// sidebar dashboard/admin & AuthShell TIDAK ikut diubah, masih pakai
// logo-baru.png (lihat app/dashboard/layout.tsx & app/admin/layout.tsx).
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Jeon.id" className={`h-9 w-auto ${className}`} />
  );
}
