"use client";

import { useState } from "react";
import { createReport } from "@/lib/api-client";
import { IconFlag } from "@/components/icons";

// REQ-F-702 (bagian publik): siapa pun bisa melaporkan halaman tanpa akun.
// autoOpen -- dipakai saat komponen ini ditampilkan DI DALAM popup lain
// (mis. baris footer "Report" ala Linktree, lihat PageFooterLinks.tsx) --
// langsung tampilkan form, lewati trigger "Laporkan halaman ini" yang
// jadi berlebihan kalau popup-nya sendiri sudah dibuka lewat klik.
export default function ReportButton({
  pageId,
  className = "text-muted",
  autoOpen = false,
}: {
  pageId: string;
  className?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      await createReport({ target_type: "page", target_id: pageId, reason });
      setSent(true);
    } catch {
      // Diam-diam gagal -- pelaporan bukan alur kritis, tidak perlu
      // mengganggu pengunjung dengan pesan error teknis.
    }
  }

  if (sent) {
    return <p className={`text-[11px] ${className}`}>Terima kasih, laporanmu sudah diterima.</p>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1 text-[11px] transition-colors ${className}`}
      >
        <IconFlag className="h-3 w-3" />
        Laporkan halaman ini
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-1.5">
      <textarea
        required
        placeholder="Kenapa halaman ini perlu ditinjau?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
      <button type="submit" className="self-start rounded-md bg-ink/10 px-3 py-1 text-[11px] font-semibold text-current hover:bg-ink/20">
        Kirim Laporan
      </button>
    </form>
  );
}
