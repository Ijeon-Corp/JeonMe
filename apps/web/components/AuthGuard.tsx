"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/api-client";

// Proteksi sesi dashboard (REQ-F-106 terkait): redirect ke /login kalau tidak
// ada token tersimpan. Pengecekan hanya di klien (token disimpan di
// localStorage, bukan cookie) -- kalau butuh proteksi di level server/SSR,
// perlu migrasi ke cookie httpOnly nanti.
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
  }, [router]);

  if (hasToken !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Memeriksa sesi...
      </div>
    );
  }

  return <>{children}</>;
}
