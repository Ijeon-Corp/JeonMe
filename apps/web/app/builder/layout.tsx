import AuthGuard from "@/components/AuthGuard";
import { ToastProvider } from "@/components/Toast";

// app/builder/layout.tsx -- redesain total Canvas Page Builder (permintaan
// langsung pengguna 10 September 2026, referensi "LYNK": "ketika masuk ke
// mode builder langsung ke page persis seperti yang ada digambar jadi isi
// page nya khusus builder saja"): rute BARU di LUAR app/dashboard/ --
// SATU-SATUNYA cara Next.js App Router bisa melewati app/dashboard/layout.tsx
// (sidebar+topbar dashboard) sama sekali, karena layout mengikuti STRUKTUR
// FOLDER FISIK, bukan struktur URL (route group `(monetisasi)` yang sudah
// ada di proyek ini cuma menyembunyikan SEGMEN URL, TETAP mewarisi layout
// leluhurnya). AuthGuard & ToastProvider dipakai APA ADANYA (generik,
// bukan spesifik dashboard) -- lihat catatan lengkap masing-masing file.
export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ToastProvider>{children}</ToastProvider>
    </AuthGuard>
  );
}
