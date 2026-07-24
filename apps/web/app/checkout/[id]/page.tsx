"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ApiError, BundleDownloadItem, CheckoutStatus, getBundleItems, getCheckoutStatus } from "@/lib/api-client";

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

  // No.70: bundel punya banyak file -- tautan unduhannya dimuat terpisah
  // begitu status sudah "paid", bukan lewat redirect satu file seperti
  // produk biasa (lihat komentar CheckoutHandler.DownloadFile).
  const [bundleItems, setBundleItems] = useState<BundleDownloadItem[] | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);

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

  useEffect(() => {
    if (status?.status === "paid" && status.is_bundle) {
      getBundleItems(params.id)
        .then((res) => setBundleItems(res.items))
        .catch((err) => setBundleError(err instanceof ApiError ? err.message : "Gagal memuat tautan unduhan."));
    }
  }, [status, params.id]);

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
                  {status.is_donation ? (
                    <>
                      Terima kasih atas dukunganmu lewat <b>{status.product_name}</b>! Dukunganmu langsung diteruskan
                      ke kreator.
                    </>
                  ) : (
                    <>
                      Terima kasih! Pesananmu untuk <b>{status.product_name}</b> sudah dikonfirmasi.
                    </>
                  )}
                </p>

                {status.is_bundle && (
                  <div className="mt-4 flex flex-col gap-2 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Unduh Semua File</p>
                    {bundleError && <p className="text-sm text-red-600">{bundleError}</p>}
                    {!bundleItems && !bundleError && <p className="text-xs text-muted">Memuat tautan unduhan...</p>}
                    {bundleItems?.map((item) => (
                      <a
                        key={item.name}
                        href={item.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary rounded-lg px-3.5 py-2.5 text-center text-sm font-bold text-white"
                      >
                        Unduh: {item.name}
                      </a>
                    ))}
                  </div>
                )}
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
