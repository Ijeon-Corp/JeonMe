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

// Ikut pill homepage (permintaan pengguna 2 September 2026, butir 3 audit
// tema): isian aksen SOLID + garis 2px + teks gelap, seperti chip "Populer"
// di kartu harga dan chip kategori di marquee landing. SEBELUMNYA tint pucat
// (bg-success-soft text-success). Makna warna dipertahankan: lime = sukses,
// kuning = menunggu/peringatan, biru = info, coral = gagal/bahaya.
// Garis & teks HITAM KONSTAN (bukan jeon-ink yang flip) karena isian aksen
// selalu terang di kedua mode -- alasan yang sama dengan IconBadge. Kecuali
// `neutral` yang isiannya latar kartu, jadi garisnya ikut flip.
const TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-2 border-[#111111] bg-jeon-lime text-[#111111]",
  warning: "border-2 border-[#111111] bg-pop-yellow text-[#111111]",
  info: "border-2 border-[#111111] bg-jeon-blue text-[#111111]",
  danger: "border-2 border-[#111111] bg-jeon-coral text-[#111111]",
  neutral: "border-2 border-jeon-ink bg-app-surface text-app-ink",
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
