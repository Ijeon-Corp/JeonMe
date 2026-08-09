import Link from "next/link";
import AuthShowcase from "@/components/AuthShowcase";

// Kerangka split-screen dipakai /register & /login (permintaan langsung
// pengguna, referensi halaman signup Beacons): form di kolom kiri (dioper
// sebagai children, logika tiap halaman TIDAK berubah -- murni restyle),
// showcase produk mengambang di kolom kanan (AuthShowcase, disembunyikan di
// bawah lg: karena dekoratif & tidak esensial di layar sempit).
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Link href="/" className="mb-10 flex items-center gap-2 font-heading text-lg font-extrabold text-gradient">
          Jeonme
        </Link>
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <div className="hidden border-l border-border bg-primary-subtle/25 px-10 lg:block">
        <AuthShowcase />
      </div>
    </main>
  );
}
