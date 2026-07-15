"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError, CheckoutStatus, getCheckoutStatus } from "@/lib/api-client";

// REQ-F-406: pesan gagal bayar yang jelas ke pembeli. Halaman ini adalah
// callbacks.finish dari Midtrans Snap -- statusnya selalu dicek ulang ke
// backend (bukan percaya query string semata), karena query string bisa
// saja tidak akurat kalau pembeli menutup tab sebelum redirect selesai atau
// webhook belum sempat diproses.
export default function CheckoutStatusPage() {
  const params = useParams<{ id: string }>();
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;

    async function poll() {
      try {
        const result = await getCheckoutStatus(params.id);
        if (cancelled) return;
        setStatus(result);
        setLoading(false);
        // Webhook mungkin belum sempat diproses persis saat pembeli
        // diarahkan kembali -- coba beberapa kali selama masih "pending".
        if (result.status === "pending" && attempts < 8) {
          attempts += 1;
          setTimeout(poll, 2000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Gagal memuat status pembayaran.");
        setLoading(false);
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-subtle/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center shadow-card">
        {loading && <p className="text-sm text-muted">Memeriksa status pembayaran...</p>}

        {error && (
          <>
            <p className="font-heading text-lg font-bold text-red-600">Terjadi Kesalahan</p>
            <p className="mt-2 text-sm text-muted">{error}</p>
          </>
        )}

        {status && !error && (
          <>
            {status.status === "paid" && (
              <>
                <p className="font-heading text-lg font-bold text-secondary-dark">Pembayaran Berhasil</p>
                <p className="mt-2 text-sm text-muted">
                  Terima kasih! Pesananmu untuk <b>{status.product_name}</b> sudah dikonfirmasi.
                </p>
              </>
            )}
            {status.status === "pending" && (
              <>
                <p className="font-heading text-lg font-bold text-ink">Menunggu Pembayaran</p>
                <p className="mt-2 text-sm text-muted">
                  Kami belum menerima konfirmasi pembayaran untuk <b>{status.product_name}</b>. Kalau kamu
                  sudah membayar, tunggu sebentar lalu muat ulang halaman ini.
                </p>
              </>
            )}
            {status.status === "expired" && (
              <>
                <p className="font-heading text-lg font-bold text-red-600">Pembayaran Kedaluwarsa</p>
                <p className="mt-2 text-sm text-muted">
                  Waktu pembayaran untuk <b>{status.product_name}</b> sudah habis. Silakan ulangi checkout.
                </p>
              </>
            )}
            {status.status === "failed" && (
              <>
                <p className="font-heading text-lg font-bold text-red-600">Pembayaran Gagal</p>
                <p className="mt-2 text-sm text-muted">
                  Pembayaran untuk <b>{status.product_name}</b> tidak berhasil. Silakan coba lagi.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
