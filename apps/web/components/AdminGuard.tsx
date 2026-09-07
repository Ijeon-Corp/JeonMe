"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getMe } from "@/lib/api-client";

// SEBELUMNYA (sebelum GetMe ada klaim role, lihat auth.go) memanggil
// getAdminSummary() dan melihat 200/403 sbg proxy "apakah aku admin".
// Diganti ke getMe() + cek role langsung (7 September 2026, permintaan
// langsung pengguna: "butuh role khusus untuk menangani live chat dsb
// jangan hak akses admin yang full") -- role='support' JUGA boleh masuk
// shell /admin (supaya bisa ke /admin/support-chat), TAPI endpoint
// /admin/summary yang dipakai proxy lama tetap murni admin-only, jadi
// proxy lama akan salah menolak akun 'support'. admin/layout.tsx yang
// membatasi menu & me-redirect 'support' menjauh dari halaman admin-only
// lain -- guard ini HANYA soal "boleh masuk shell /admin atau tidak".
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authorized" | "denied">("checking");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getMe()
      .then((me) => setStatus(me.role === "admin" || me.role === "support" ? "authorized" : "denied"))
      .catch(() => setStatus("denied"));
  }, [router]);

  if (status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <p className="font-display text-lg font-bold text-red-600">Akses Ditolak</p>
          <p className="mt-1 text-sm text-app-muted">Halaman ini hanya untuk admin.</p>
        </div>
      </div>
    );
  }

  if (status !== "authorized") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-app-muted">
        Memeriksa akses...
      </div>
    );
  }

  return <>{children}</>;
}
