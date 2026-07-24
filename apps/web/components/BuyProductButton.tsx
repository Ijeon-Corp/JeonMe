"use client";

import { useState } from "react";
import { ApiError, createCheckout, validateVoucher } from "@/lib/api-client";

export default function BuyProductButton({
  productId,
  buttonClassName = "bg-primary text-white hover:opacity-90",
  pwywMinPriceIdr,
}: {
  productId: string;
  buttonClassName?: string;
  pwywMinPriceIdr?: number;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buyerAmount, setBuyerAmount] = useState(pwywMinPriceIdr ? String(pwywMinPriceIdr) : "");

  const [showVoucher, setShowVoucher] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [checkingVoucher, setCheckingVoucher] = useState(false);
  const [voucherResult, setVoucherResult] = useState<{ discountIDR: number; finalIDR: number } | null>(null);
  const [voucherMessage, setVoucherMessage] = useState<string | null>(null);

  async function handleApplyVoucher() {
    if (!voucherCode.trim()) return;
    setCheckingVoucher(true);
    setVoucherMessage(null);
    setVoucherResult(null);
    try {
      const res = await validateVoucher({
        code: voucherCode.trim(),
        product_id: productId,
        buyer_amount_idr: pwywMinPriceIdr !== undefined ? Number(buyerAmount) : undefined,
      });
      if (res.valid && res.discount_idr !== undefined && res.final_amount_idr !== undefined) {
        setVoucherResult({ discountIDR: res.discount_idr, finalIDR: res.final_amount_idr });
      } else {
        setVoucherMessage(res.message ?? "Kode voucher tidak valid.");
      }
    } catch (err) {
      setVoucherMessage(err instanceof ApiError ? err.message : "Gagal memeriksa voucher, coba lagi.");
    } finally {
      setCheckingVoucher(false);
    }
  }

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwywMinPriceIdr !== undefined && (!buyerAmount || Number(buyerAmount) < pwywMinPriceIdr)) {
      setError(`Jumlah pembayaran minimal Rp${pwywMinPriceIdr.toLocaleString("id-ID")}.`);
      return;
    }
    setLoading(true);
    try {
      const { invoice_url } = await createCheckout({
        product_id: productId,
        buyer_email: email,
        voucher_code: voucherResult ? voucherCode.trim() : undefined,
        buyer_amount_idr: pwywMinPriceIdr !== undefined ? Number(buyerAmount) : undefined,
      });
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
      {pwywMinPriceIdr !== undefined && (
        <div>
          <label className="text-[10px] font-semibold opacity-80">
            Bayar berapa saja, min Rp{pwywMinPriceIdr.toLocaleString("id-ID")}
          </label>
          <input
            type="number"
            required
            min={pwywMinPriceIdr}
            value={buyerAmount}
            onChange={(e) => setBuyerAmount(e.target.value)}
            className="mt-0.5 w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          />
        </div>
      )}
      <input
        type="email"
        required
        placeholder="Email kamu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />

      {!showVoucher ? (
        <button
          type="button"
          onClick={() => setShowVoucher(true)}
          className="text-left text-[10px] font-semibold underline opacity-80"
        >
          Punya kode voucher?
        </button>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Kode voucher"
              value={voucherCode}
              onChange={(e) => {
                setVoucherCode(e.target.value.toUpperCase());
                setVoucherResult(null);
                setVoucherMessage(null);
              }}
              className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs uppercase text-ink focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={handleApplyVoucher}
              disabled={checkingVoucher || !voucherCode.trim()}
              className="flex-shrink-0 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-ink disabled:opacity-60"
            >
              {checkingVoucher ? "..." : "Terapkan"}
            </button>
          </div>
          {voucherResult && (
            <p className="text-[10px] font-semibold text-green-300">
              Diskon Rp {voucherResult.discountIDR.toLocaleString("id-ID")} diterapkan -- total Rp{" "}
              {voucherResult.finalIDR.toLocaleString("id-ID")}
            </p>
          )}
          {voucherMessage && <p className="text-[10px] text-red-400">{voucherMessage}</p>}
        </div>
      )}

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
