"use client";

import { useState } from "react";
import { ApiError, subscribeLead } from "@/lib/api-client";

// No.73 (Sprint 8): form pengumpulan email/WhatsApp pengunjung. Berbeda
// dari BuyProductButton -- tidak ada langkah "buka dulu", submit langsung
// mengurangi friksi (itu inti dari lead capture).
export default function LeadCaptureForm({
  username,
  collectEmail,
  collectWhatsapp,
  inputClassName,
  buttonClassName,
}: {
  username: string;
  collectEmail: boolean;
  collectWhatsapp: boolean;
  inputClassName: string;
  buttonClassName: string;
}) {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() && !whatsapp.trim()) {
      setError("Isi email atau nomor WhatsApp.");
      return;
    }
    setLoading(true);
    try {
      await subscribeLead({
        username,
        email: email.trim() || undefined,
        whatsapp_number: whatsapp.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <p className="mt-2 text-xs font-semibold">Berhasil mendaftar. Terima kasih!</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex w-full flex-col gap-1.5">
      {collectEmail && (
        <input
          type="email"
          placeholder="Email kamu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClassName}
        />
      )}
      {collectWhatsapp && (
        <input
          type="tel"
          placeholder="Nomor WhatsApp"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          className={inputClassName}
        />
      )}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className={`w-full rounded-lg py-1.5 text-xs font-bold transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
      >
        {loading ? "Mengirim..." : "Daftar"}
      </button>
    </form>
  );
}
