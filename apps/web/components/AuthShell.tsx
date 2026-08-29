import Link from "next/link";
import AuthShowcase from "@/components/AuthShowcase";

// Kerangka split-screen dipakai /register & /login (permintaan langsung
// pengguna, referensi halaman signup Beacons): form di kolom kiri (dioper
// sebagai children, logika tiap halaman TIDAK berubah -- murni restyle),
// showcase produk mengambang di kolom kanan (AuthShowcase, disembunyikan di
// bawah lg: karena dekoratif & tidak esensial di layar sempit).
// Logo -- permintaan langsung pengguna, 29 Agustus 2026: "di login dan
// register gunakan logo.png" (sebelumnya logo-baru.png, wordmark "im" yang
// sudah tidak dipakai lagi di landing, lihat components/landing/Logo.tsx).
// className "brand-logo-img" WAJIB ikut -- lihat catatan dark-mode-filter
// di globals.css/Logo.tsx (glyph "jeon" hijau tua nyaris tak kelihatan di
// bg-app-surface dark mode tanpa filter brightness itu).
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell grid min-h-screen bg-app-surface lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Link href="/" className="mb-10 inline-flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Jeon.id" className="brand-logo-img h-9 w-auto" />
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="hidden border-l border-app-border bg-primary-subtle/25 px-10 lg:block">
        <AuthShowcase />
      </div>
    </main>
  );
}
