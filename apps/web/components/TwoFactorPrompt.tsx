"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { get2FAStatus, snooze2FA } from "@/lib/api-client";
import { IconShield } from "@/components/icons";

// Modul Settings §5 acceptance criteria: pengguna dengan rekening pembayaran
// aktif mendapat prompt WAJIB aktifkan 2FA, snooze maksimal 7 hari (bukan
// permanen skip) -- lihat SecurityHandler.Status2FA/Snooze2FA backend.
// Banner, bukan modal blocking: spec minta "prompt", bukan "kunci akses".
export default function TwoFactorPrompt() {
  const [visible, setVisible] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  useEffect(() => {
    get2FAStatus()
      .then((s) => setVisible(s.required))
      .catch(() => {
        // Fail-silent -- kalau status gagal dimuat, jangan tampilkan banner
        // dari data yang tidak pasti.
      });
  }, []);

  async function handleSnooze() {
    setSnoozing(true);
    try {
      await snooze2FA();
      setVisible(false);
    } catch {
      // Diamkan -- banner tetap tampil, pengguna bisa coba lagi kapan saja.
    } finally {
      setSnoozing(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800">
        <IconShield className="h-4 w-4 flex-shrink-0" />
        Akunmu punya rekening pembayaran terhubung — aktifkan 2FA untuk melindunginya.
      </div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/settings/security" className="text-xs font-bold text-amber-800 hover:underline">
          Aktifkan Sekarang
        </Link>
        <button
          type="button"
          onClick={handleSnooze}
          disabled={snoozing}
          className="text-xs font-semibold text-amber-700 hover:underline disabled:opacity-60"
        >
          Ingatkan lagi dalam 7 hari
        </button>
      </div>
    </div>
  );
}
