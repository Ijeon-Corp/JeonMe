"use client";

import { useState } from "react";
import { ApiError, createCheckout } from "@/lib/api-client";

export default function BuyProductButton({ productId }: { productId: string }) {
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
        className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-bold text-white hover:opacity-90"
      >
        Beli
      </button>
    );
  }

  return (
    <form onSubmit={handleBuy} className="mt-2 flex flex-col gap-1.5">
      <input
        type="email"
        required
        placeholder="Email kamu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none"
      />
      {error && <p className="text-[10px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Memproses..." : "Bayar Sekarang"}
      </button>
    </form>
  );
}
