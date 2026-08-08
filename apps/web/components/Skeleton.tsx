// Skeleton -- Modul UX (permintaan langsung pengguna, tema dashboard
// premium, 9 Agustus 2026): blok placeholder shimmer, pengganti teks polos
// "Memuat..." yang sebelumnya dipakai di ~30 halaman dashboard. Meniru
// bentuk PERSIS tiap halaman di luar cakupan (terlalu banyak variasi
// layout) -- cukup satu bentuk generik (judul + beberapa baris kartu) yang
// terasa lebih "hidup" dibanding teks statis, dipakai lewat PageSkeleton
// di SEMUA state "if (loading) return ...".  animate-pulse bawaan Tailwind
// (bukan keyframe kustom).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-primary-subtle/70 ${className}`} />;
}

export default function PageSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
