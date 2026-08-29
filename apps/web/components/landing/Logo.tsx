// Logo -- permintaan langsung pengguna, 24 Agustus 2026: "di navbar dan
// footer pakai logo.png". SEBELUMNYA pakai logo-baru.png (wordmark "im"
// bergaya glow di LATAR HITAM) -- kotak hitam solid itu tampil aneh di
// Navbar & Footer landing yang keduanya berbackground putih (bug visual
// nyata, bukan cuma preferensi). logo.png berlatar TRANSPARAN & memuat
// wordmark "jeon.id" penuh, jadi lebih cocok dipakai di sini. Susulan 29
// Agustus 2026: "di login dan register gunakan logo.png" -- AuthShell.tsx
// ikut pakai logo.png sekarang juga. Sidebar dashboard/admin TETAP pakai
// logo-baru.png (di luar cakupan kedua permintaan ini, lihat
// app/dashboard/layout.tsx & app/admin/layout.tsx). className
// "brand-logo-img" (globals.css) WAJIB ikut kalau dipakai di latar yang
// bisa gelap (bg-app-surface/.nav-glass dark mode) -- glyph "jeon"-nya
// hijau tua, nyaris tak kelihatan di latar gelap tanpa filter brightness
// itu (temuan audit visual dark mode terpisah).
export default function Logo({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Jeon.id" className={`brand-logo-img h-9 w-auto ${className}`} />
  );
}
