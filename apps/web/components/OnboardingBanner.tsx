"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingChecklistItem, dismissOnboarding, getOnboardingStatus } from "@/lib/api-client";
import { IconCheck, IconChevronRight, IconClose, IconSparkle } from "@/components/icons";

// Modul Onboarding, redesain checklist progresif (Gap #5 benchmark
// kompetitif, permintaan langsung pengguna, 9 Agustus 2026): pita statis
// SEBELUMNYA cuma "Baru di Jeonme? Lihat Tutorial" -- satu link ke halaman
// statis, tidak ada arahan actionable atau rasa progres sama sekali.
// Checklist ("2/4 selesai" + progress bar + item bisa diklik langsung ke
// halaman terkait) adalah pola onboarding 2026 yang terbukti -- "speed to
// first value" adalah prediktor kuat retensi minggu pertama (lihat riset
// di laporan benchmark kompetitif). Item DIHITUNG SERVER-SIDE (satu
// sumber kebenaran, lihat OnboardingHandler.GetStatus), komponen ini
// murni menampilkan & mengelola expand/collapse + dismiss.
//
// Tampil untuk kreator gratis MAUPUN Premium sampai ditutup (lihat
// catatan lengkap di OnboardingHandler soal kenapa ini bukan cuma "user
// baru saja daftar"). Pola SAMA seperti AccountDeletionBanner: status
// dimuat sekali, fail-silent kalau gagal (jangan tampilkan dari data
// yang tidak pasti).
export default function OnboardingBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [checklist, setChecklist] = useState<OnboardingChecklistItem[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOnboardingStatus()
      .then((s) => {
        setDismissed(s.dismissed);
        setChecklist(s.checklist);
        setDoneCount(s.done_count);
        setTotal(s.total);
      })
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

  if (dismissed || total === 0) return null;

  const allDone = doneCount === total;
  const pct = Math.round((doneCount / total) * 100);
  // nextItem -- langkah BERIKUTNYA yang belum selesai, ditonjolkan sebagai
  // satu CTA jelas di baris ringkas (pola "action-oriented guidance": beri
  // SATU langkah jelas, bukan daftar panjang tak berurutan) -- checklist
  // penuh tetap ada lewat toggle "Lihat semua" untuk yang mau lihat semua
  // sekaligus.
  const nextItem = checklist.find((i) => !i.done);

  return (
    <div className="border-b border-primary/20 bg-primary-subtle/40 px-4 py-2.5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <IconSparkle className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink">
              {allDone ? "Setup akunmu selesai!" : "Lengkapi setup akunmu"} -- {doneCount}/{total} selesai
            </p>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-white/70 sm:w-48">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-3">
          {!allDone && nextItem && (
            <Link href={nextItem.href} className="hidden text-xs font-bold text-primary hover:underline sm:inline">
              {nextItem.label} &rarr;
            </Link>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary"
          >
            {expanded ? "Sembunyikan" : "Lihat semua"}
            <IconChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>
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

      {expanded && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-primary/10 pt-3">
          {checklist.map((item) => (
            <li key={item.key}>
              {item.done ? (
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
                    <IconCheck className="h-3 w-3" />
                  </span>
                  <span className="line-through">{item.label}</span>
                </span>
              ) : (
                <Link href={item.href} className="flex items-center gap-2 text-xs font-semibold text-ink hover:text-primary">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-muted" />
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
