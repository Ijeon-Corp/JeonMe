"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dismissOnboarding, getOnboardingStatus } from "@/lib/api-client";
import { IconClose, IconPlayCircle } from "@/components/icons";

// Modul Onboarding: pita "Tutorial" -- tampil untuk kreator gratis MAUPUN
// Premium sampai ditutup (lihat catatan lengkap di OnboardingHandler soal
// kenapa ini bukan cuma "user baru saja daftar"). Pola SAMA seperti
// AccountDeletionBanner: status dimuat sekali dari endpoint khusus,
// fail-silent kalau gagal (jangan tampilkan dari data yang tidak pasti).
export default function OnboardingBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOnboardingStatus()
      .then((s) => setDismissed(s.dismissed))
      .catch(() => {
        // Fail-silent, sama seperti AccountDeletionBanner.
      });
  }, []);

  async function handleDismiss() {
    setBusy(true);
    setDismissed(true);
    try {
      await dismissOnboarding();
    } catch {
      // Sudah disembunyikan optimis di sisi klien -- kalau permintaan
      // gagal, paling banter pita ini muncul lagi di kunjungan berikutnya,
      // bukan kegagalan yang perlu diberitahukan ke kreator.
    } finally {
      setBusy(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 bg-primary-subtle/40 px-4 py-2.5 sm:px-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink">
        <IconPlayCircle className="h-4 w-4 flex-shrink-0 text-primary" />
        Baru di Jeonme? Pelajari cara membuat link bio dan produk pertamamu.
      </div>
      <div className="flex items-center gap-3">
        <Link href="/dashboard/tutorial" className="text-xs font-bold text-primary hover:underline" onClick={handleDismiss}>
          Lihat Tutorial
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          title="Tutup"
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-black/5"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
