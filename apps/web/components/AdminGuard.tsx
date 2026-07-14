"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getAdminSummary } from "@/lib/api-client";

// Tidak ada klaim "role" di JWT (lihat middleware.AdminRequired -- sengaja
// selalu cek DB langsung, bukan percaya token, supaya demosi admin langsung
// berlaku). Jadi cara termudah frontend tahu "apakah aku admin" adalah
// memanggil salah satu endpoint admin dan lihat hasilnya: 200 = admin,
// 403/401 = bukan, redirect keluar.
export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authorized" | "denied">("checking");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getAdminSummary()
      .then(() => setStatus("authorized"))
      .catch(() => setStatus("denied"));
  }, [router]);

  if (status === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <p className="font-heading text-lg font-bold text-red-600">Akses Ditolak</p>
          <p className="mt-1 text-sm text-muted">Halaman ini hanya untuk admin.</p>
        </div>
      </div>
    );
  }

  if (status !== "authorized") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Memeriksa akses...
      </div>
    );
  }

  return <>{children}</>;
}
