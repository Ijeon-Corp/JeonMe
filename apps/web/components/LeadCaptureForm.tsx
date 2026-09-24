"use client";

import { useState } from "react";
import { ApiError, SubscribeLeadResult, subscribeLead } from "@/lib/api-client";
import { copyText } from "@/lib/copy-text";

// No.73 (Sprint 8): form pengumpulan email/WhatsApp pengunjung. Berbeda
// dari BuyProductButton -- tidak ada langkah "buka dulu", submit langsung
// mengurangi friksi (itu inti dari lead capture).
//
// Subscribe v2 (benchmark Linktree "Member", 3 September 2026): Telegram
// ikut dikumpulkan; setelah mendaftar pengunjung langsung menerima hadiah
// di layar -- tautan unduh lead magnet (presigned 15 menit) dan/atau kode
// voucher sambutan. Dijanjikan SEBELUM submit (teaser) supaya alasan
// mendaftar jelas, tapi kode/file baru muncul SESUDAH data masuk.
export default function LeadCaptureForm({
  username,
  collectEmail,
  collectWhatsapp,
  collectTelegram = false,
  magnetTitle = "",
  hasVoucher = false,
  inputClassName,
  buttonClassName,
}: {
  username: string;
  collectEmail: boolean;
  collectWhatsapp: boolean;
  collectTelegram?: boolean;
  magnetTitle?: string;
  hasVoucher?: boolean;
  inputClassName: string;
  buttonClassName: string;
}) {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [telegram, setTelegram] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubscribeLeadResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() && !whatsapp.trim() && !telegram.trim()) {
      setError("Isi email, nomor WhatsApp, atau username Telegram.");
      return;
    }
    setLoading(true);
    try {
      const res = await subscribeLead({
        username,
        email: email.trim() || undefined,
        whatsapp_number: whatsapp.trim() || undefined,
        telegram_username: telegram.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  function copyVoucher(code: string) {
    copyText(code).then((ok) => { if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (result) {
    return (
      <div className="mt-2 flex w-full flex-col items-center gap-2">
        <p className="text-xs font-semibold">Berhasil mendaftar. Terima kasih!</p>
        {result.download_url && (
          <a
            href={result.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full rounded-lg py-1.5 text-center text-xs font-bold transition-all duration-200 ${buttonClassName}`}
          >
            Unduh {result.download_name || "file"}
          </a>
        )}
        {result.voucher_code && (
          <button
            type="button"
            onClick={() => copyVoucher(result.voucher_code ?? "")}
            className={`w-full rounded-lg border border-dashed border-current px-2 py-1.5 text-xs font-bold tracking-widest ${inputClassName}`}
            title="Salin kode voucher"
          >
            {copied ? "Tersalin!" : `Kode voucher: ${result.voucher_code}`}
          </button>
        )}
      </div>
    );
  }

  const teaser = [magnetTitle ? `Dapatkan "${magnetTitle}" gratis` : "", hasVoucher ? "kode voucher spesial" : ""].filter(Boolean).join(" + ");

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex w-full flex-col gap-1.5">
      {teaser && <p className="text-[11px] font-semibold opacity-80">{teaser} setelah mendaftar.</p>}
      {collectEmail && (
        <input type="email" placeholder="Email kamu" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClassName} />
      )}
      {collectWhatsapp && (
        <input type="tel" placeholder="Nomor WhatsApp" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className={inputClassName} />
      )}
      {collectTelegram && (
        <input type="text" placeholder="Username Telegram (@kamu)" value={telegram} onChange={(e) => setTelegram(e.target.value)} maxLength={40} className={inputClassName} />
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
