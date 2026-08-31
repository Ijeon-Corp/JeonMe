"use client";

// StatusBadge (JEONID-DASHBOARD-REDESIGN-SPEC.md §8.7, Phase 1 Foundation).
// SATU pemetaan status→tone terpusat -- aturan §8.7: "Tidak boleh ada kelas
// warna status hard-coded baru di page". 66 file dengan warna status
// hard-coded existing (docs/dashboard-redesign/phase0-inventory.md §3)
// dimigrasikan ke sini bertahap; halaman lama TIDAK diubah paksa sebelum
// fasenya (cleanup penuh = Phase 8).
//
// Warna via token --dash-* yang FLIP di dark mode (teks status terang di
// atas soft gelap) -- jangan ganti ke kelas Tailwind literal.
export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral";

// Pemetaan sesuai spec §8.7 + status nyata yang dipakai backend existing
// (order/payout/kyc/broadcast/kolaborator -- lihat DASHBOARD-CURRENT-STATE.md).
const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  paid: "success",
  verified: "success",
  completed: "success",
  sent: "success",
  live: "success",
  pending: "warning",
  queued: "warning",
  requested: "warning",
  unverified: "neutral",
  processing: "info",
  sending: "info",
  refunded: "info",
  invited: "info",
  draft: "neutral",
  inactive: "neutral",
  expired: "neutral",
  failed: "danger",
  rejected: "danger",
  canceled: "danger",
  revoked: "danger",
};

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-dash-surface-subtle text-dash-muted border border-dash-border",
};

export function statusToneOf(status: string): StatusTone {
  return STATUS_TONE[status] ?? "neutral";
}

export default function StatusBadge({
  status,
  label,
  tone,
  className = "",
}: {
  // Key status mentah dari backend (paid/pending/...) -- menentukan tone
  // lewat pemetaan pusat, KECUALI `tone` dioper eksplisit.
  status: string;
  // Teks tampil (sudah di-t() oleh pemanggil). Default: status mentah.
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const resolved = tone ?? statusToneOf(status);
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONE_CLASSES[resolved]} ${className}`}
    >
      {label ?? status}
    </span>
  );
}
