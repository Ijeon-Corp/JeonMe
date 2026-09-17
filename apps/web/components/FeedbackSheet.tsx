"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Share2 } from "lucide-react";
import { IconClose } from "@/components/icons";
import { ApiError, submitPageFeedback } from "@/lib/api-client";

// FeedbackSheet -- popup "Kritik dan Saran" dari footer halaman publik
// (permintaan langsung pengguna, 18 September 2026, satu screenshot
// referensi): lembar (bottom sheet di HP, kartu di desktop) berisi judul,
// kalimat terima kasih yang menyebut nama halaman, form Nama/Email/Nomor
// HP (+62)/Pesan, catatan persetujuan data, tombol Kirim yang baru aktif
// setelah semua terisi, plus tombol bagikan & tutup mengambang di kanan
// bawah -- tata letak yang sama dengan lembar galeri (GalleryBlock.tsx).
// Kiriman diteruskan ke email kreator lewat endpoint publik
// POST /pages/:username/feedback (LinksHandler.SubmitPageFeedback), memakai
// ulang antrean notifikasi blok Formulir Kontak yang sudah ada.
export default function FeedbackSheet({
  username,
  displayName,
  onClose,
}: {
  username: string;
  displayName?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  const brand = displayName?.trim() || `@${username}`;
  const phoneDigits = phone.replace(/\D/g, "");
  const canSend = name.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && phoneDigits.length >= 8 && message.trim().length > 0 && !loading;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setError(null);
    setLoading(true);
    try {
      await submitPageFeedback(username, {
        name: name.trim(),
        email: email.trim(),
        // Nomor disimpan dalam format internasional (+62...) -- prefix "0"
        // lokal dibuang, konvensi sama normalizeWhatsappNumber di dashboard.
        phone: `+62${phoneDigits.replace(/^0+/, "")}`,
        message: message.trim(),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: brand, url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      }
    } catch {
      // Pengunjung membatalkan share sheet native -- bukan error.
    }
  }

  const inputClass = "w-full rounded-lg bg-neutral-100 px-4 py-3.5 text-base text-[#111111] placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#111111]/15";

  return createPortal(
    <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label="Kritik dan Saran">
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#111111] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 px-6 pb-2 pt-5 text-center">
          <h2 className="font-display text-xl font-semibold">Kritik dan Saran</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-28 pt-2 sm:px-6">
          {sent ? (
            <div className="py-10 text-center">
              <p className="text-lg font-bold">Terima kasih!</p>
              <p className="mt-2 text-base text-black/60">Kritik dan saranmu sudah terkirim ke {brand}.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-center text-base leading-relaxed">
                Terima kasih atas saran dan kritik Anda, kami akan memperbaiki kualitas <span className="font-semibold">{brand}</span> secepatnya.
              </p>
              <input type="text" required maxLength={100} placeholder="Nama*" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              <input type="email" required placeholder="Alamat email*" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              <div className="flex overflow-hidden rounded-lg bg-neutral-100">
                <span className="flex flex-shrink-0 items-center gap-1 border-r border-black/10 px-4 text-base text-[#111111]">
                  +62 <span aria-hidden className="text-[10px]">▼</span>
                </span>
                <input
                  type="tel"
                  required
                  inputMode="numeric"
                  placeholder="Nomor HP*"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-base text-[#111111] placeholder:text-neutral-500 focus:outline-none"
                />
              </div>
              <textarea required maxLength={2000} rows={4} placeholder="Pesan*" value={message} onChange={(e) => setMessage(e.target.value)} className={`${inputClass} resize-y`} />
              <p className="px-4 text-center text-sm leading-relaxed text-black/70">
                Dengan mengirim data kontakmu, kamu memberikan datamu kepada {brand} yang mungkin akan menghubungimu.
              </p>
              {error && <p className="text-center text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={!canSend}
                className="w-full rounded-full bg-[#111111] py-4 text-base font-semibold text-white transition-colors disabled:bg-neutral-200 disabled:text-neutral-400"
              >
                {loading ? "Mengirim..." : "Kirim"}
              </button>
            </form>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-3 p-5">
          <button
            type="button"
            onClick={handleShare}
            aria-label="Bagikan"
            title={shareState === "copied" ? "Tautan disalin" : "Bagikan"}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-1 ring-black/10 hover:bg-neutral-100"
          >
            {shareState === "copied" ? <span className="text-[10px] font-bold">OK</span> : <Share2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-1 ring-black/10 hover:bg-neutral-100"
          >
            <IconClose className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
