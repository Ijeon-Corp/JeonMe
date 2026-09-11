"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ApiError,
  BundleDownloadItem,
  CheckoutStatus,
  CourseChapterView,
  getBundleItems,
  getCheckoutStatus,
  getCourseChaptersForOrder,
  submitReview,
} from "@/lib/api-client";
import SocialProofToast from "@/components/SocialProofToast";
import VideoEmbedBlock from "@/components/VideoEmbedBlock";
import { IconCheck, IconChevronRight, IconClock, IconStar, IconX } from "@/components/icons";

// REQ-F-406: pesan gagal bayar yang jelas ke pembeli. Halaman ini adalah
// callbacks.finish dari Midtrans Snap -- statusnya selalu dicek ulang ke
// backend (bukan percaya query string semata), karena query string bisa
// saja tidak akurat kalau pembeli menutup tab sebelum redirect selesai atau
// webhook belum sempat diproses.
export default function CheckoutStatusPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // isAutoPolling/rechecking -- permintaan langsung pengguna, 10 September
  // 2026 ("alur pembelian ... ui dan ux nya masih sangat kurang"):
  // SEBELUMNYA status "pending" cuma teks minta reload MANUAL browser,
  // tanpa indikator apa pun bahwa sistem sedang memeriksa ulang di
  // belakang layar (auto-poll 2 detik x8 SUDAH ADA, cuma tidak terlihat).
  const [isAutoPolling, setIsAutoPolling] = useState(false);
  const [rechecking, setRechecking] = useState(false);

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
          setIsAutoPolling(true);
          setTimeout(poll, 2000);
        } else {
          setIsAutoPolling(false);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Gagal memuat status pembayaran.");
        setLoading(false);
        setIsAutoPolling(false);
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

  // handleManualRecheck -- tombol "Cek Ulang" (permintaan langsung
  // pengguna, 10 September 2026): SEBELUMNYA pembeli yang kembali LAMA
  // setelah 8x percobaan auto-poll habis (mis. menutup tab lalu buka lagi
  // dari email) tidak punya aksi sama sekali selain me-refresh browser
  // secara manual -- tombol ini murni memanggil ulang endpoint yang sama,
  // TIDAK menghidupkan lagi auto-poll (supaya tidak dobel jalan).
  async function handleManualRecheck() {
    setRechecking(true);
    setError(null);
    try {
      const result = await getCheckoutStatus(params.id);
      setStatus(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat status pembayaran.");
    } finally {
      setRechecking(false);
    }
  }

  const backToCreatorHref = status?.creator_username ? `/${status.creator_username}` : null;

  // showsActionableContent -- permintaan langsung pengguna, 11 September
  // 2026 ("info bahwa produk telah dikirimkan ke email lalu redirect ke lp
  // lagi setelah 5 detik"): auto-redirect HANYA masuk akal kalau halaman
  // ini TIDAK punya apa pun untuk diambil pembeli (Payment Link/Donasi/
  // Event registrasi -- delivery_method-nya sengaja kosong, lihat
  // CheckoutStatus.delivery_method) -- produk digital/bundel/kursus TETAP
  // seperti sebelumnya (TIDAK auto-redirect) supaya pembeli sempat
  // mengunduh & memberi rating dulu (dikonfirmasi via AskUserQuestion).
  const showsActionableContent = Boolean(status?.is_bundle || status?.is_course || status?.delivery_method);

  // redirectSeconds/redirectCancelled -- hitung mundur 5 detik + tombol
  // "Batal" (permintaan sama) supaya pembeli yang masih ingin memberi
  // rating tetap punya jalan keluar, bukan dipaksa pergi begitu saja.
  // Nilai awal 5 lewat useState (BUKAN di-set balik di badan efek) --
  // react-hooks/set-state-in-effect (lihat CLAUDE.md) melarang setState
  // sinkron di badan efek, kedua panggilan di bawah SENGAJA hanya terjadi
  // di dalam callback interval/timeout (async), bukan langsung di badan efek.
  const [redirectSeconds, setRedirectSeconds] = useState(5);
  const [redirectCancelled, setRedirectCancelled] = useState(false);
  const showRedirectCountdown = status?.status === "paid" && !showsActionableContent && !!backToCreatorHref && !redirectCancelled;

  useEffect(() => {
    if (!showRedirectCountdown || !backToCreatorHref) return;
    const interval = setInterval(() => {
      setRedirectSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    const timeout = setTimeout(() => {
      router.push(backToCreatorHref);
    }, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router stabil dari Next, tidak perlu memicu ulang efek.
  }, [showRedirectCountdown, backToCreatorHref]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-jeon-purple/5 px-4">
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
        {loading && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-jeon-purple/20 border-t-jeon-purple" aria-hidden />
            <p className="text-sm text-muted">Memeriksa status pembayaran...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <IconX className="h-6 w-6 text-red-600" />
            </span>
            <p className="font-heading text-lg font-bold text-red-600">Terjadi Kesalahan</p>
            <p className="text-sm text-muted">{error}</p>
          </div>
        )}

        {status && !error && (
          <>
            {status.status === "paid" && (
              <>
                <div className="flex flex-col items-center gap-2">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                    <IconCheck className="h-6 w-6 text-green-600" />
                  </span>
                  <p className="font-heading text-lg font-bold text-jeon-purple">Pembayaran Berhasil</p>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {status.is_payment_link && status.success_message ? (
                    status.success_message
                  ) : status.is_donation ? (
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

                {/* Info email + auto-redirect -- permintaan langsung pengguna,
                    11 September 2026 ("infokan bahwa misal product telah
                    dikirimkan ke email lalu redirect ke lp lagi setelah 5
                    detik"): HANYA untuk Payment Link/Donasi/Event registrasi
                    (lihat showsActionableContent) -- produk digital/bundel/
                    kursus TETAP seperti sebelumnya (dikonfirmasi via
                    AskUserQuestion), supaya pembeli sempat mengunduh & kasih
                    rating dulu tanpa dipaksa pergi. */}
                {showRedirectCountdown && (
                  <div className="mt-4 rounded-xl border border-border bg-jeon-purple/5 p-3.5 text-center">
                    <p className="text-sm text-app-ink">Detail pesanan sudah dikirim ke emailmu.</p>
                    <p className="mt-1 text-xs text-muted">
                      Mengalihkan ke halaman kreator dalam {redirectSeconds} detik...{" "}
                      <button
                        type="button"
                        onClick={() => setRedirectCancelled(true)}
                        className="font-semibold text-jeon-purple underline"
                      >
                        Batal
                      </button>
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
                  <div className="mt-4 rounded-xl border border-border bg-jeon-purple/5 p-3.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Status Pesanan</p>
                    {status.fulfilled_at ? (
                      <p className="mt-1 text-sm font-semibold text-jeon-purple">
                        Sudah diproses penjual pada{" "}
                        {new Date(status.fulfilled_at).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-app-ink">
                        Pesananmu akan diproses & dikirim langsung oleh penjual (lewat email/WhatsApp). Mohon tunggu.
                      </p>
                    )}
                  </div>
                )}

                {status.delivery_method === "random_code" && (
                  <div className="mt-4 rounded-xl border border-border bg-jeon-purple/5 p-3.5 text-left">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Kode Kamu</p>
                    {status.claimed_code ? (
                      <p className="mt-1 select-all rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-bold text-app-ink">
                        {status.claimed_code}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-app-ink">
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
                          cardClassName="rounded-xl border border-border bg-jeon-purple/5 p-3"
                          titleClassName="text-app-ink"
                        />
                        {chapter.description && <p className="mt-2 text-xs text-muted">{chapter.description}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <ReviewForm orderId={params.id} />
              </>
            )}
            {status.status === "pending" && (
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
                  <IconClock className="h-6 w-6 text-amber-600" />
                </span>
                <p className="font-heading text-lg font-bold text-app-ink">Menunggu Pembayaran</p>
                <p className="text-sm text-muted">
                  Kami belum menerima konfirmasi pembayaran untuk <b>{status.product_name}</b>.
                </p>
                {isAutoPolling && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
                    Sedang memeriksa otomatis...
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleManualRecheck}
                  disabled={rechecking}
                  className="btn-primary mt-1 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {rechecking ? "Memeriksa..." : "Cek Ulang"}
                </button>
              </div>
            )}
            {status.status === "expired" && (
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <IconX className="h-6 w-6 text-red-600" />
                </span>
                <p className="font-heading text-lg font-bold text-red-600">Pembayaran Kedaluwarsa</p>
                <p className="text-sm text-muted">
                  Waktu pembayaran untuk <b>{status.product_name}</b> sudah habis. Silakan ulangi checkout.
                </p>
                {backToCreatorHref && (
                  <Link href={backToCreatorHref} className="btn-primary mt-1 rounded-lg px-4 py-2 text-xs font-bold text-white">
                    Kembali ke Halaman Kreator
                  </Link>
                )}
              </div>
            )}
            {status.status === "failed" && (
              <div className="flex flex-col items-center gap-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <IconX className="h-6 w-6 text-red-600" />
                </span>
                <p className="font-heading text-lg font-bold text-red-600">Pembayaran Gagal</p>
                <p className="text-sm text-muted">
                  Pembayaran untuk <b>{status.product_name}</b> tidak berhasil. Silakan coba lagi.
                </p>
                {backToCreatorHref && (
                  <Link href={backToCreatorHref} className="btn-primary mt-1 rounded-lg px-4 py-2 text-xs font-bold text-white">
                    Kembali ke Halaman Kreator
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Riwayat pembelian pembeli -- permintaan langsung pengguna, 10
          September 2026: entry point PALING wajar (persis setelah
          transaksi), tanpa perlu tautan global baru di setiap halaman
          publik kreator. */}
      <Link href="/pembelian" className="flex items-center gap-1 text-xs font-semibold text-jeon-purple hover:underline">
        Lihat riwayat pembelian saya
        <IconChevronRight className="h-3.5 w-3.5" />
      </Link>
    </main>
  );
}

// ReviewForm -- Modul Toko (Fase E1): ulasan pembeli, ditampilkan setelah
// pembayaran berhasil untuk SEMUA jenis produk (bukan cuma digital biasa) --
// backend menegakkan "hanya order lunas, hanya sekali" (lihat ReviewHandler.
// Submit), jadi form ini boleh optimis menampilkan diri lalu membiarkan
// backend menolak submit ganda dengan pesan jelas.
function ReviewForm({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      setError("Pilih rating bintang dulu.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitReview(orderId, { rating, comment: comment.trim() || undefined });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim ulasan.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 rounded-xl border border-border bg-jeon-purple/5 p-3.5 text-left">
        <p className="text-sm font-semibold text-jeon-purple">Terima kasih atas ulasanmu!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-xl border border-border bg-jeon-purple/5 p-3.5 text-left">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">Beri Ulasan</p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            aria-label={`${n} bintang`}
          >
            <IconStar className={`h-6 w-6 ${n <= (hoverRating || rating) ? "text-amber-500" : "text-border"}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Ceritakan pengalamanmu (opsional)"
        rows={2}
        className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
      />
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="btn-primary mt-2 rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
      >
        {submitting ? "Mengirim..." : "Kirim Ulasan"}
      </button>
    </form>
  );
}
