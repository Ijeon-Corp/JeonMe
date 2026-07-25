"use client";

import { useState } from "react";
import { ApiError, trackEvent, trackEventBySlug, unlockLink } from "@/lib/api-client";

// No.79 (Sprint 9): tombol pengganti TrackedLink untuk tautan terkunci --
// URL asli TIDAK PERNAH ada di payload halaman publik untuk tautan ini
// (lihat komentar PageHandler.publicLink), jadi harus lewat gerbang kunci
// dulu (POST /links/:id/unlock) untuk mendapat URL sebelum membuka tab baru.
// No.98 (Sprint 14): `pageSlug` diisi kalau ini halaman bio TAMBAHAN --
// lihat catatan di PageAnalytics soal kenapa tidak boleh lewat username.
export default function LockedLinkButton({
  username,
  pageSlug,
  linkId,
  title,
  lockType,
  lockMinAge,
  className,
}: {
  username: string;
  pageSlug?: string;
  linkId: string;
  title: string;
  lockType: "age" | "code" | "subscribe";
  lockMinAge: number | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lockType === "subscribe" && !email.trim() && !whatsapp.trim()) {
      setError("Isi email atau nomor WhatsApp.");
      return;
    }
    setLoading(true);
    try {
      const { url } = await unlockLink(linkId, {
        code: lockType === "code" ? code.trim() : undefined,
        email: lockType === "subscribe" ? email.trim() || undefined : undefined,
        whatsapp_number: lockType === "subscribe" ? whatsapp.trim() || undefined : undefined,
      });
      if (pageSlug) {
        trackEventBySlug(pageSlug, { event_type: "click", link_id: linkId });
      } else {
        trackEvent(username, { event_type: "click", link_id: linkId });
      }
      window.open(url, "_blank", "noopener,noreferrer");
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuka tautan, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <span className="w-full truncate text-center">🔒 {title}</span>
      </button>
    );
  }

  return (
    <form onSubmit={handleUnlock} className="flex w-full flex-col gap-1.5 rounded-2xl border border-border bg-white p-3.5 text-left shadow-card">
      <p className="truncate text-sm font-semibold text-ink">🔒 {title}</p>

      {lockType === "age" && (
        <p className="text-xs text-muted">Konten ini untuk usia {lockMinAge ?? 18}+ tahun.</p>
      )}
      {lockType === "code" && (
        <input
          type="text"
          placeholder="Masukkan kode akses"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
        />
      )}
      {lockType === "subscribe" && (
        <>
          <input
            type="email"
            placeholder="Email kamu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <input
            type="tel"
            placeholder="Nomor WhatsApp (opsional)"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
        </>
      )}

      {error && <p className="text-[10px] text-red-500">{error}</p>}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
        >
          {loading ? "Membuka..." : lockType === "age" ? "Ya, lanjutkan" : "Buka"}
        </button>
      </div>
    </form>
  );
}
