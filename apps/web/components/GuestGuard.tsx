"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";

// GuestGuard -- kebalikan AuthGuard (permintaan langsung pengguna, 1
// September 2026: "kenapa saya sudah berhasil login tetap masih bisa akses
// login"). Halaman login/register SEBELUMNYA tidak pernah mengecek apakah
// pengguna sudah punya sesi, jadi pengguna yang sudah masuk tetap bisa
// membuka form login lagi.
//
// Tujuan redirect memakai redirectAfterAuth() yang sama dengan alur login
// sungguhan -- admin ke /admin, kreator ke /dashboard -- supaya tidak ada
// dua sumber kebenaran soal "habis auth ke mana".
//
// Anak komponen TETAP dirender selama pengecekan (bukan layar kosong):
// kasus paling umum adalah pengguna yang MEMANG belum login, jadi jangan
// menghukum mereka dengan penundaan; yang sudah login hanya melihat satu
// frame sebelum diarahkan.
//
// Sengaja TIDAK dipasang di /forgot-password dan /reset-password: tautan
// reset datang dari email dan harus tetap bisa dibuka walau ada token lama
// yang nyangkut di browser -- kalau diarahkan pergi, pemulihan password
// justru terkunci. /verify-email juga dibiarkan karena alurnya dipakai
// justru saat akun belum bisa login.
export default function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Baca token di effect (bukan saat render) supaya render pertama klien
  // identik dengan HTML server -- pola sama seperti AuthGuard.
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRedirecting(true);
    void redirectAfterAuth({ push: (href: string) => router.replace(href) });
    // Pola sama seperti AuthGuard.tsx (lihat catatan lengkap di sana, bug
    // dashboard "2x refresh" 13 September 2026) -- efek sekali-saat-mount
    // ini tidak perlu jalan ulang gara-gara referensi router berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-jeon-purple" aria-label="Loading" role="status" />
      </div>
    );
  }

  return <>{children}</>;
}
