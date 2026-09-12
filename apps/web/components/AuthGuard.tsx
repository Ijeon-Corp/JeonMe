"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";

// Proteksi sesi dashboard (REQ-F-106 terkait): redirect ke /login kalau tidak
// ada token tersimpan. Pengecekan hanya di klien (token disimpan di
// localStorage, bukan cookie) -- kalau butuh proteksi di level server/SSR,
// perlu migrasi ke cookie httpOnly nanti.
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { t } = useLocale();
  // Mulai dari null (bukan baca localStorage langsung) supaya render pertama
  // di client SAMA PERSIS dengan HTML dari server -- localStorage tidak ada
  // saat SSR, jadi membacanya langsung di sini akan memicu hydration mismatch.
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    // Sinkronisasi dari localStorage (sistem eksternal di luar React) setelah
    // mount, bukan derived state biasa -- harus lewat effect karena tidak
    // tersedia saat SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasToken(true);
    // Bug ditemukan 13 September 2026 (laporan pengguna: halaman dashboard
    // "2x refresh" -- diverifikasi lewat instrumentasi langsung, TERJADI
    // JUGA di production build, bukan cuma artefak React Strict Mode dev):
    // deps [router] SEBELUMNYA di sini berasumsi referensi router dari
    // useRouter() selalu stabil antar render -- kalau asumsi itu meleset,
    // efek pengecekan token ini (yang harusnya sekali saja saat mount) bisa
    // jalan ulang, ikut memicu unmount/remount {children} sehingga SEMUA
    // efek fetch data dashboard di bawahnya (layout+halaman) jalan 2x.
    // Efek ini murni "cek token sekali saat mount", tidak pernah perlu
    // jalan ulang gara-gara router berubah -- deps kosong sesuai maksud
    // aslinya.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hasToken !== true) {
    // Kerangka BERBENTUK SHELL, bukan layar kosong (permintaan langsung
    // pengguna, 1 September 2026: "ketika di klik jangan ada seperti
    // flash"). Akar masalahnya: seluruh dashboard dirender di klien, jadi
    // HTML server halaman /dashboard cuma berisi layar "Memeriksa sesi"
    // yang di TENGAH -- begitu hydration selesai layarnya berganti total
    // jadi sidebar+topbar+konten. Pergantian dari layar kosong ke layout
    // penuh itulah yang terlihat sebagai "flash" setiap kali terjadi
    // reload keras (mis. klik menu sebelum hydration selesai).
    // Placeholder ini meniru geometri shell (sidebar gelap + topbar +
    // area konten) sehingga transisinya nyaris tak terlihat. Murni visual:
    // logika token/redirect TIDAK berubah, dan teks aslinya tetap ada
    // untuk screen reader.
    return (
      <div className="app-shell flex min-h-screen" aria-busy="true">
        <span role="status" className="sr-only">
          {t("dashboard.components.authGuard.checkingSession")}
        </span>
        {/* Sidebar: rail 72px di md..xl, penuh di >=xl -- sama seperti shell */}
        <div className="hidden w-[72px] flex-shrink-0 bg-jeon-sidebar md:block xl:w-[var(--dashboard-sidebar)]" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="nav-glass h-[56px] flex-shrink-0 md:h-[72px]" aria-hidden="true" />
          <div className="flex-1 p-4 sm:p-6" aria-hidden="true">
            <div className="h-6 w-48 animate-pulse rounded-lg bg-app-surface-2" />
            <div className="mt-4 h-24 w-full animate-pulse rounded-jlg bg-app-surface-2" />
            <div className="mt-3 h-24 w-full animate-pulse rounded-jlg bg-app-surface-2" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
