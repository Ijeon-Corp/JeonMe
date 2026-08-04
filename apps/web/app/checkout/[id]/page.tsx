"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ApiError,
  BundleDownloadItem,
  CheckoutStatus,
  CourseChapterView,
  getBundleItems,
  getCheckoutStatus,
  getCourseChaptersForOrder,
} from "@/lib/api-client";
import SocialProofToast from "@/components/SocialProofToast";
import VideoEmbedBlock from "@/components/VideoEmbedBlock";

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

  // No.91: kursus punya banyak bab video -- dimuat terpisah begitu status
  // sudah "paid", sama seperti pola bundel di atas (video selalu tautan
  // embed, jadi tidak butuh presigned URL sama sekali).
  const [courseChapters, setCourseChapters] = useState<CourseChapterView[] | null>(null);
  const [courseError, setCourseError] = useState<string | null>(null);

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

  useEffect(() => {
    if (status?.status === "paid" && status.is_course) {
      getCourseChaptersForOrder(params.id)
        .then((res) => setCourseChapters(res.chapters))
        .catch((err) => setCourseError(err instanceof ApiError ? err.message : "Gagal memuat bab kursus."));
    }
  }, [status, params.id]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-subtle/40 px-4">
      {status?.social_proof && (
        <SocialProofToast
          recent={status.social_proof.recent}
          displaySeconds={status.social_proof.display_seconds}
          intervalSeconds={status.social_proof.interval_seconds}
        />
      )}
      <div
        className={`w-full rounded-2xl border border-border bg-white p-8 text-center shadow-card ${
          status?.status === "paid" && status.is_course ? "max-w-xl" : "max-w-sm"
        }`}
      >
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

                {status.is_booking && status.booked_slot_at && (
                  <div className="mt-4 rounded-xl border border-border bg-primary-subtle/30 p-3.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Jadwal Konsultasimu</p>
                    <p className="mt-1 text-sm font-semibold text-ink">
                      {new Date(status.booked_slot_at).toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" })}
                    </p>
                  </div>
                )}

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

                {/* Modul Toko (Fase C): status penyerahan untuk produk digital
                    biasa -- download_link TIDAK ditampilkan di sini (pola
                    lama: tautan unduhan dikirim lewat email, lihat
                    worker.HandleOrderPaidNotification), method lain
                    (manual/random_code) diberi tampilan khusus karena
                    pembeli butuh tahu APA yang terjadi selanjutnya. */}
                {status.delivery_method === "manual" && (
                  <div className="mt-4 rounded-xl border border-border bg-primary-subtle/30 p-3.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Status Pesanan</p>
                    {status.fulfilled_at ? (
                      <p className="mt-1 text-sm font-semibold text-secondary-dark">
                        Sudah diproses penjual pada{" "}
                        {new Date(status.fulfilled_at).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink">
                        Pesananmu akan diproses & dikirim langsung oleh penjual (lewat email/WhatsApp). Mohon tunggu.
                      </p>
                    )}
                  </div>
                )}

                {status.delivery_method === "random_code" && (
                  <div className="mt-4 rounded-xl border border-border bg-primary-subtle/30 p-3.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Kode Kamu</p>
                    {status.claimed_code ? (
                      <p className="mt-1 select-all rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-bold text-ink">
                        {status.claimed_code}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-ink">
                        Kode sedang disiapkan. Kalau tidak muncul dalam beberapa menit, hubungi penjual.
                      </p>
                    )}
                  </div>
                )}

                {status.is_course && (
                  <div className="mt-4 flex flex-col gap-4 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Materi Kursus</p>
                    {courseError && <p className="text-sm text-red-600">{courseError}</p>}
                    {!courseChapters && !courseError && <p className="text-xs text-muted">Memuat bab kursus...</p>}
                    {courseChapters?.map((chapter, i) => (
                      <div key={i}>
                        <VideoEmbedBlock
                          title={`Bab ${i + 1}: ${chapter.title}`}
                          videoUrl={chapter.video_url}
                          cardClassName="rounded-xl border border-border bg-primary-subtle/20 p-3"
                          titleClassName="text-ink"
                        />
                        {chapter.description && <p className="mt-2 text-xs text-muted">{chapter.description}</p>}
                      </div>
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
