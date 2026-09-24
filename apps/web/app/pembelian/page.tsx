"use client";

import Image from "next/image";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  MyOrderSummary,
  listMyOrders,
  requestOrderHistoryCode,
  verifyOrderHistoryCode,
} from "@/lib/api-client";
import { IconChevronRight } from "@/components/icons";

// app/pembelian/page.tsx -- riwayat pembelian pembeli (permintaan langsung
// pengguna, 10 September 2026: "alur pembelian product ini terasa ui dan
// ux nya masih sangat kurang", cakupan PALING BESAR dipilih via
// AskUserQuestion). Halaman publik BERDIRI SENDIRI (di luar /dashboard,
// TANPA AuthGuard) -- ini untuk PEMBELI (tidak punya akun sama sekali),
// bukan kreator yang login. Tiga langkah dalam satu halaman: email -> kode
// 6-digit -> daftar order, meniru pola verifikasi Loyalitas (loyalty.go)
// yang sudah teruji, lewat endpoint /orders/request-code, /orders/verify-code,
// /orders/mine (orders_public.go). Sesi tersimpan di sessionStorage (BUKAN
// localStorage -- token backend berlaku 30 menit, sessionStorage otomatis
// hilang begitu tab ditutup, konsisten dgn masa berlaku singkat itu).
const SESSION_STORAGE_KEY = "jeon_order_history_session";

interface StoredSession {
  email: string;
  token: string;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.email === "string" && typeof parsed?.token === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // best-effort -- halaman tetap berfungsi tanpa persistensi sesi.
  }
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // best-effort.
  }
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Lunas",
  pending: "Menunggu Pembayaran",
  expired: "Kedaluwarsa",
  failed: "Gagal",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  expired: "bg-app-surface-2 text-app-muted",
  failed: "bg-red-100 text-red-700",
};

type Step = "email" | "code" | "list";

export default function OrderHistoryPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devHint, setDevHint] = useState<string | null>(null);
  const [orders, setOrders] = useState<MyOrderSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // sessionToken/hasMore/loadingMore -- ditambahkan lewat audit performa
  // profesional 15 September 2026: sebelumnya endpoint /orders/mine
  // mengambil SEMUA order tanpa batas & tanpa index sama sekali (lihat
  // migrasi 000099_orders_buyer_email_index) -- sekarang limit/offset
  // sungguhan, token sesi disimpan di state (bukan cuma dipakai sekali
  // saat load pertama) supaya tombol "Muat lebih banyak" bisa memanggil
  // ulang endpoint yang sama dgn offset bertambah.
  const [sessionToken, setSessionToken] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // loadOrders -- SENGAJA men-setState email/token JUGA di sini (bukan di
  // pemanggil), supaya efek pemulihan sesi tersimpan di bawah bisa
  // memanggil fungsi ini sebagai SATU-SATUNYA pemanggilan tanpa setState
  // langsung apa pun di badan efeknya sendiri (react-hooks/set-state-in-effect,
  // eslint-plugin-react-hooks v7 -- melarang setState SINKRON di badan
  // efek; panggilan ke fungsi async terpisah seperti ini TIDAK terjaring
  // aturan itu karena setState-nya baru terjadi setelah `await`, bukan
  // sinkron di badan efek).
  async function loadOrders(sessionEmail: string, token: string) {
    setEmail(sessionEmail);
    setSessionToken(token);
    setLoading(true);
    setError(null);
    try {
      const res = await listMyOrders(sessionEmail, token);
      setOrders(res.orders);
      setHasMore(res.has_more);
      setStep("list");
    } catch (err) {
      clearStoredSession();
      setError(err instanceof ApiError ? err.message : "Sesi verifikasi tidak valid, silakan minta kode baru.");
      setStep("email");
    } finally {
      setLoading(false);
    }
  }

  function handleLoadMoreOrders() {
    if (!orders) return;
    setLoadingMore(true);
    listMyOrders(email, sessionToken, orders.length)
      .then((res) => {
        setOrders((prev) => [...(prev ?? []), ...res.orders]);
        setHasMore(res.has_more);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pembelian lebih lanjut."))
      .finally(() => setLoadingMore(false));
  }

  // Sesi tersimpan (kunjungan sebelumnya, masih dalam tab yang sama) --
  // efek samping ASYNC (network fetch). Pola resmi (CLAUDE.md,
  // react-hooks/set-state-in-effect): fungsi FETCH murni (listMyOrders,
  // TANPA setState) dirangkai `.then(applyResult)` LANGSUNG pada promise
  // yang dipanggil di badan efek -- BUKAN lewat loadOrders (fungsi itu
  // sendiri men-setState sebelum promise-nya di-return, ke-deteksi linter
  // sebagai "setState sinkron di badan efek" walau dipanggil tanpa
  // `await`). loadOrders TETAP dipakai APA ADANYA oleh handleVerifyCode
  // (event handler, bukan efek -- aturan ini tidak berlaku di sana).
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;
    let cancelled = false;
    listMyOrders(stored.email, stored.token)
      .then((res) => {
        if (cancelled) return;
        setEmail(stored.email);
        setSessionToken(stored.token);
        setOrders(res.orders);
        setHasMore(res.has_more);
        setStep("list");
      })
      .catch((err) => {
        if (cancelled) return;
        clearStoredSession();
        setError(err instanceof ApiError ? err.message : "Sesi verifikasi tidak valid, silakan minta kode baru.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await requestOrderHistoryCode(email.trim());
      if (res.dev_verification_code) {
        setCode(res.dev_verification_code);
        setDevHint(`Mode dev (SMTP belum dikonfigurasi): kode sudah diisi otomatis (${res.dev_verification_code}).`);
      }
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim kode, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await verifyOrderHistoryCode(email.trim(), code.trim());
      saveStoredSession({ email: email.trim(), token: res.verification_token });
      await loadOrders(email.trim(), res.verification_token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kode salah atau sudah kedaluwarsa.");
    } finally {
      setLoading(false);
    }
  }

  function handleUseDifferentEmail() {
    clearStoredSession();
    setEmail("");
    setCode("");
    setOrders(null);
    setError(null);
    setStep("email");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-jeon-purple/5 px-4 py-10">
      {/* bg-app-surface (BUKAN bg-white) -- perbaikan kontras 24 September
          2026. Halaman pembeli ini ada DI LUAR .app-shell, jadi tidak kena
          jaring pengaman remap dark mode yang di-scope ke shell. Kartu
          hardcode putih sementara teksnya pakai token text-app-ink yang IKUT
          membalik jadi terang di dark mode -> rasio 1.16:1, judul & isi
          praktis tidak terlihat. Token app-* sendiri didefinisikan global di
          :root (lihat globals.css), jadi aman dipakai di luar shell. */}
      <div className="w-full max-w-md rounded-2xl border border-app-border bg-app-surface p-8 shadow-card">
        <p className="font-heading text-lg font-bold text-app-ink">Riwayat Pembelian</p>
        <p className="mt-1 text-sm text-muted">
          Lihat semua pesanan yang pernah kamu buat di Jeon.id, lintas semua toko kreator.
        </p>

        {step === "email" && (
          <form onSubmit={handleRequestCode} className="mt-5 flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">Email yang kamu pakai saat membeli</label>
              <input
                type="email"
                required
                autoFocus
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {loading ? "Mengirim..." : "Kirim Kode Verifikasi"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={handleVerifyCode} className="mt-5 flex flex-col gap-3">
            <p className="text-sm text-muted">
              Kalau <b>{email}</b> pernah belanja di Jeon.id, kode verifikasi 6 digit sudah dikirim ke email itu.
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">Kode Verifikasi</label>
              <input
                type="text"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-center font-mono text-lg tracking-[0.3em] focus:border-jeon-purple focus:outline-none"
              />
            </div>
            {devHint && <p className="text-xs text-amber-600">{devHint}</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? "Memeriksa..." : "Verifikasi"}
            </button>
            <button type="button" onClick={handleUseDifferentEmail} className="text-xs font-semibold text-app-muted hover:text-app-ink">
              Ganti email
            </button>
          </form>
        )}

        {step === "list" && (
          <div className="mt-5 flex flex-col gap-3">
            {loading && <p className="text-sm text-muted">Memuat riwayat pembelian...</p>}
            {!loading && orders && orders.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
                Belum ada pembelian yang tercatat untuk email ini.
              </p>
            )}
            {!loading &&
              orders?.map((order) => (
                <Link
                  key={order.order_id}
                  href={`/checkout/${order.order_id}`}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:border-jeon-purple"
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-app-surface-2">
                    {order.cover_image_url ? (
                      // Ukuran TETAP 48px -- kotak pembungkusnya h-12 w-12.
                      <Image src={order.cover_image_url} alt={order.product_name} width={48} height={48} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-app-muted">{order.product_name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-app-ink">{order.product_name}</p>
                    <p className="text-xs text-app-muted">
                      @{order.creator_username} &middot; {new Date(order.created_at).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE_CLASS[order.status] ?? "bg-app-surface-2 text-app-muted"}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    <p className="text-xs font-bold text-app-ink">Rp {order.amount_idr.toLocaleString("id-ID")}</p>
                  </div>
                  <IconChevronRight className="h-4 w-4 flex-shrink-0 text-app-muted" />
                </Link>
              ))}
            {!loading && hasMore && (
              <button
                type="button"
                disabled={loadingMore}
                onClick={handleLoadMoreOrders}
                className="rounded-lg border border-border py-2 text-xs font-semibold text-app-ink hover:border-jeon-purple disabled:opacity-60"
              >
                {loadingMore ? "Memuat..." : "Muat lebih banyak"}
              </button>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button type="button" onClick={handleUseDifferentEmail} className="mt-1 text-xs font-semibold text-app-muted hover:text-app-ink">
              Bukan kamu? Ganti email
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
