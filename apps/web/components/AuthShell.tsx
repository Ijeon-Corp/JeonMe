import Link from "next/link";
import AuthShowcase from "@/components/AuthShowcase";
import Logo from "@/components/landing/Logo";

// Kerangka split-screen dipakai /register & /login (permintaan langsung
// pengguna, referensi halaman signup Beacons): form di kolom kiri (dioper
// sebagai children, logika tiap halaman TIDAK berubah -- murni restyle),
// showcase produk mengambang di kolom kanan (AuthShowcase, disembunyikan di
// bawah lg: karena dekoratif & tidak esensial di layar sempit).
//
// Restyle redesign Fase 3 (DESIGN-JEONID-REDESIGN.md §2.4 "auth: bersih
// dan fokus"): logo.png diganti wordmark teks jeon.id (komponen Logo yang
// sama dengan Navbar/Footer marketing, spec §9); kolom kanan showcase
// pakai tint lavender lembut menggantikan hijau muda lama. Permukaan
// bg-app-surface/border-app-border sudah otomatis ikut palet baru lewat
// remap variabel --app-* di globals.css.
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell grid min-h-screen bg-app-surface lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Link href="/" className="mb-10 inline-flex items-center" aria-label="jeon.id home">
          <Logo />
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="hidden border-l border-app-border bg-jeon-lavender/25 px-10 lg:block">
        <AuthShowcase />
      </div>
    </main>
  );
}
