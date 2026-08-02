"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAccountDeletionStatus } from "@/lib/api-client";
import { IconTrash } from "@/components/icons";

// Modul Settings §6: akun yang sedang menunggu penghapusan (14 hari) tetap
// bisa login (lihat catatan AuthHandler.Login -- SENGAJA tidak diblokir,
// supaya pengguna selalu punya jalan membatalkan sendiri) -- pita ini
// mengingatkan di SETIAP halaman dashboard, bukan cuma di Zona Berbahaya,
// supaya jadwal hapus tidak terlewat tanpa sengaja.
export default function AccountDeletionBanner() {
  const [scheduledPurgeAt, setScheduledPurgeAt] = useState<string | null>(null);

  useEffect(() => {
    getAccountDeletionStatus()
      .then((s) => setScheduledPurgeAt(s.pending ? (s.scheduled_purge_at ?? null) : null))
      .catch(() => {
        // Fail-silent -- kalau status gagal dimuat, jangan tampilkan pita
        // dari data yang tidak pasti.
      });
  }, []);

  if (!scheduledPurgeAt) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
        <IconTrash className="h-4 w-4 flex-shrink-0" />
        Akunmu dijadwalkan dihapus permanen pada {new Date(scheduledPurgeAt).toLocaleString("id-ID")}.
      </div>
      <Link href="/dashboard/settings/danger-zone" className="text-xs font-bold text-red-700 hover:underline">
        Batalkan Penghapusan
      </Link>
    </div>
  );
}
