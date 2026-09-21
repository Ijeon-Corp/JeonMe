import Link from "next/link";
import Logo from "@/components/landing/Logo";

// app/not-found.tsx -- bug UI/UX ditemukan 21 September 2026 (audit
// menyeluruh): TIDAK ADA halaman 404 kustom di seluruh aplikasi sebelum
// ini -- username tidak ada, /card/{user-tanpa-kartu}, halaman tambahan
// dengan slug salah, dst. semuanya jatuh ke 404 bawaan Next.js yang polos
// total (tanpa logo/navigasi/tautan kembali). Berdampak di SELURUH situs
// (publik maupun dashboard), perbaikannya sederhana -- satu file di root
// App Router otomatis menjadi fallback untuk semua rute yang tidak cocok
// DAN untuk setiap pemanggilan notFound() eksplisit di halaman manapun.
// Sengaja teks Indonesia hardcode (bukan lewat t()/dictionaries.ts) --
// halaman publik/marketing di repo ini konsisten tidak memakai sistem i18n
// dashboard, cuma halaman /dashboard/* yang memakainya.
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-jeon-paper px-6 py-16 text-center">
      <Link href="/" aria-label="Beranda jeon.id">
        <Logo />
      </Link>
      <div className="flex flex-col gap-2">
        <p className="font-display text-sm font-bold uppercase tracking-wide text-jeon-purple">404</p>
        <h1 className="font-display text-2xl font-bold text-jeon-ink sm:text-3xl">Halaman tidak ditemukan</h1>
        <p className="max-w-md text-sm text-jeon-muted">
          Halaman yang kamu cari mungkin sudah dipindahkan, dihapus, atau alamatnya salah ketik.
        </p>
      </div>
      <Link href="/" className="btn-primary rounded-full px-6 py-3 text-sm font-bold text-white">
        Kembali ke Beranda
      </Link>
    </main>
  );
}
