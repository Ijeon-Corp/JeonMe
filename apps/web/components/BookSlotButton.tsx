"use client";

import { useEffect, useState } from "react";
import { ApiError, AvailableSlot, createCheckout, getAvailableSlots } from "@/lib/api-client";

// No.92 (Sprint 11): beda dari BuyProductButton -- pembeli WAJIB memilih
// slot waktu dulu sebelum checkout bisa dimulai (backend menolak tanpa
// slot_id, lihat CheckoutHandler.Create). Slot dimuat begitu tombol dibuka
// (lazy), bukan digabung ke payload halaman utama.
export default function BookSlotButton({
  productId,
  buttonClassName = "bg-primary text-white hover:opacity-90",
}: {
  productId: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [email, setEmail] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || slots) return;
    getAvailableSlots(productId)
      .then(setSlots)
      .catch((err) => setSlotsError(err instanceof ApiError ? err.message : "Gagal memuat slot yang tersedia."));
  }, [open, slots, productId]);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedSlotId) {
      setError("Pilih slot waktu terlebih dahulu.");
      return;
    }
    setLoading(true);
    try {
      const { invoice_url } = await createCheckout({
        product_id: productId,
        buyer_email: email,
        buyer_contact: whatsappNumber.trim() || undefined,
        slot_id: selectedSlotId,
      });
      window.location.href = invoice_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai checkout, coba lagi.");
      setLoading(false);
      // Slot mungkin baru saja direbut pembeli lain -- muat ulang daftar
      // slot supaya tidak menawarkan slot yang sama lagi.
      setSlots(null);
      setSelectedSlotId("");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2.5 w-full rounded-lg py-1.5 text-xs transition-all duration-200 ${buttonClassName}`}
      >
        Pilih Jadwal
      </button>
    );
  }

  return (
    <form onSubmit={handleBook} className="mt-2.5 flex flex-col gap-1.5">
      {slotsError && <p className="text-[10px] text-red-400">{slotsError}</p>}
      {!slots && !slotsError && <p className="text-[10px] opacity-80">Memuat slot...</p>}
      {slots && slots.length === 0 && <p className="text-[10px] opacity-80">Semua slot sudah dipesan.</p>}
      {slots && slots.length > 0 && (
        <select
          required
          value={selectedSlotId}
          onChange={(e) => setSelectedSlotId(e.target.value)}
          className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
        >
          <option value="">Pilih jadwal...</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {new Date(slot.starts_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
            </option>
          ))}
        </select>
      )}
      <input
        type="email"
        required
        placeholder="Email kamu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
      {/* No.74 (Sprint 8): sama seperti BuyProductButton -- nomor WhatsApp
          opsional supaya konfirmasi jadwal juga bisa dikirim lewat kanal
          WhatsApp, bukan cuma email. */}
      <input
        type="tel"
        placeholder="Nomor WhatsApp (opsional)"
        value={whatsappNumber}
        onChange={(e) => setWhatsappNumber(e.target.value)}
        className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading || !slots || slots.length === 0}
        className={`w-full rounded-lg py-1.5 text-xs transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
      >
        {loading ? "Memproses..." : "Bayar & Pesan Jadwal"}
      </button>
    </form>
  );
}
