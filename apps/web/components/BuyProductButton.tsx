"use client";

import { useState } from "react";
import { ApiError, createCheckout } from "@/lib/api-client";

export default function BuyProductButton({
  productId,
  buttonClassName = "bg-primary text-white hover:opacity-90",
}: {
  productId: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { invoice_url } = await createCheckout({ product_id: productId, buyer_email: email });
      window.location.href = invoice_url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai checkout, coba lagi.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-2.5 w-full rounded-lg py-1.5 text-xs transition-all duration-200 ${buttonClassName}`}
      >
        Beli
      </button>
    );
  }

  return (
    <form onSubmit={handleBuy} className="mt-2.5 flex flex-col gap-1.5">
      <input
        type="email"
        required
        placeholder="Email kamu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className={`w-full rounded-lg py-1.5 text-xs transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
      >
        {loading ? "Memproses..." : "Bayar Sekarang"}
      </button>
    </form>
  );
}
