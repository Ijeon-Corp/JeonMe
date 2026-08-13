"use client";

import { useState } from "react";
import { ApiError, submitContactForm } from "@/lib/api-client";

// No.77 (Sprint 9): blok formulir kontak -- selalu sama (nama/email/pesan),
// tidak ada kustomisasi field untuk versi awal. Notifikasi ke kreator
// dikirim asinkron di backend (lihat queue.TypeContactFormNotification).
export default function ContactFormBlock({
  linkId,
  title,
  cardClassName,
  titleClassName,
  inputClassName,
  buttonClassName,
  icon,
}: {
  linkId: string;
  title: string;
  cardClassName: string;
  titleClassName: string;
  inputClassName: string;
  buttonClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await submitContactForm(linkId, { name, email, message });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim pesan, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className={cardClassName}>
        <p className={`text-sm font-semibold ${titleClassName}`}>Pesan terkirim, terima kasih!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <input
          type="text"
          required
          placeholder="Nama kamu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClassName}
        />
        <input
          type="email"
          required
          placeholder="Email kamu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClassName}
        />
        <textarea
          required
          placeholder="Pesan kamu"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={inputClassName}
        />
        {error && <p className="text-[10px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-lg py-1.5 text-xs font-bold transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
        >
          {loading ? "Mengirim..." : "Kirim Pesan"}
        </button>
      </div>
    </form>
  );
}
