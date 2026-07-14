"use client";

import { useState } from "react";
import { createReport } from "@/lib/api-client";

// REQ-F-702 (bagian publik): siapa pun bisa melaporkan halaman tanpa akun.
export default function ReportButton({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
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
    return <p className="mt-2 text-[11px] text-muted">Terima kasih, laporanmu sudah diterima.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[11px] text-muted underline">
        Laporkan halaman ini
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex w-full flex-col gap-1.5">
      <textarea
        required
        placeholder="Kenapa halaman ini perlu ditinjau?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none"
      />
      <button type="submit" className="self-start rounded-md bg-gray-100 px-3 py-1 text-[11px] font-semibold text-ink hover:bg-gray-200">
        Kirim Laporan
      </button>
    </form>
  );
}
