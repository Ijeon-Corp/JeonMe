"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  SubscriptionStatus,
  cancelSubscription,
  checkoutSubscription,
  getSubscriptionStatus,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconChevronRight, IconStar } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";

// Modul Langganan Premium: menghilangkan watermark halaman publik + latar
// kustom (theme="custom"). Harga BELUM keputusan bisnis final (placeholder,
// lihat monthly_price_idr/yearly_price_idr dari backend -- TIDAK di-hardcode
// di sini) -- kreator memilih siklus "Bulanan + Tahunan (diskon)" tapi belum
// menyebut angka pastinya.
//
// Alur checkout: pilih siklus -> POST /dashboard/subscription/checkout ->
// redirect penuh (bukan popup) ke invoice_url (halaman Snap Midtrans
// ter-hosting) -> Snap redirect balik ke halaman ini (FinishRedirectURL)
// setelah bayar -> reload status (webhook backend yang MENGAKTIFKAN
// langganan biasanya tiba dalam hitungan detik, jadi status sesaat setelah
// redirect balik bisa saja masih "pending_card" -- lihat catatan di bawah).
export default function SettingsSubscriptionPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<"monthly" | "yearly" | null>(null);
  const [canceling, setCanceling] = useState(false);

  function reload() {
    return getSubscriptionStatus().then(setStatus);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat status langganan."));
  }, []);

  async function handleCheckout(plan: "monthly" | "yearly") {
    setCheckingOut(plan);
    try {
      const res = await checkoutSubscription(plan);
      window.location.href = res.invoice_url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal memulai pembayaran, coba lagi.", "error");
      setCheckingOut(null);
    }
  }

  async function handleCancel() {
    if (
      !(await confirmAction("Batalkan langganan Premium? Akses Premium tetap berlaku sampai akhir periode yang sudah dibayar.", {
        confirmButtonText: "Ya, Batalkan",
      }))
    ) {
      return;
    }
    setCanceling(true);
    try {
      await cancelSubscription();
      await reload();
      showToast("Langganan dibatalkan, akses Premium berlaku sampai akhir periode.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal membatalkan langganan.", "error");
    } finally {
      setCanceling(false);
    }
  }

  if (status === null) {
    return <PageSkeleton />;
  }

  const isLive = status.status === "pending_card" || status.status === "active" || status.status === "past_due";
  const periodEndLabel = status.current_period_end
    ? new Date(status.current_period_end).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        Pengaturan
      </Link>

      <h1 className="mt-3 flex items-center gap-2 font-heading text-2xl font-bold text-ink">
        <IconStar className="h-6 w-6 text-amber-500" />
        Langganan Premium
      </h1>
      <p className="mt-1 text-sm text-muted">
        Hilangkan watermark &quot;Buat halaman gratis di Jeonme&quot; di halaman publikmu, dan gunakan latar belakang
        kustom (warna/gradien/gambar sendiri).
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {status.is_premium ? (
        <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2">
            <IconStar className="h-5 w-5 text-amber-500" />
            <h2 className="font-heading text-sm font-bold text-ink">
              Kamu Premium ({status.plan === "yearly" ? "Tahunan" : "Bulanan"})
            </h2>
          </div>
          <p className="mt-2 text-xs text-muted">
            {status.status === "canceled"
              ? `Sudah dibatalkan, akses Premium berlaku sampai ${periodEndLabel ?? "akhir periode yang sudah dibayar"}.`
              : status.status === "past_due"
              ? "Penagihan siklus terakhir gagal -- perbarui metode pembayaranmu di Midtrans supaya langganan tidak nonaktif."
              : periodEndLabel
              ? `Diperpanjang otomatis pada ${periodEndLabel}.`
              : "Aktif."}
          </p>
          {status.status !== "canceled" && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={canceling}
              className="mt-3 rounded-lg border border-border bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:border-red-300 disabled:opacity-60"
            >
              {canceling ? "Membatalkan..." : "Batalkan Langganan"}
            </button>
          )}
        </section>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PricingCard
            label="Bulanan"
            priceIDR={status.monthly_price_idr}
            priceSuffix="/bulan"
            onSubscribe={() => handleCheckout("monthly")}
            busy={checkingOut === "monthly"}
            disabled={checkingOut !== null || isLive}
          />
          <PricingCard
            label="Tahunan"
            priceIDR={status.yearly_price_idr}
            priceSuffix="/tahun"
            badge="Hemat"
            highlight
            onSubscribe={() => handleCheckout("yearly")}
            busy={checkingOut === "yearly"}
            disabled={checkingOut !== null || isLive}
          />
        </div>
      )}

      {!status.is_premium && isLive && (
        <p className="mt-3 rounded-lg bg-primary-subtle/40 px-3 py-2 text-xs text-muted">
          Pembayaran pendaftaran sedang diproses. Kalau kamu baru saja menyelesaikan pembayaran di Midtrans, muat
          ulang halaman ini dalam beberapa saat.
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-2 text-sm text-ink">
        <BenefitRow text="Hilangkan watermark Jeonme di halaman publikmu" />
        <BenefitRow text="Latar belakang kustom (warna, gradien, atau gambar sendiri)" />
      </ul>

      <p className="mt-4 text-[11px] text-muted">
        Ditagih otomatis lewat kartu kredit/debit tersimpan tiap siklus (bulanan atau tahunan) sampai kamu batalkan.
      </p>
    </div>
  );
}

function BenefitRow({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
        <IconCheck className="h-3 w-3" />
      </span>
      {text}
    </li>
  );
}

function PricingCard({
  label,
  priceIDR,
  priceSuffix,
  badge,
  highlight,
  onSubscribe,
  busy,
  disabled,
}: {
  label: string;
  priceIDR: number;
  priceSuffix: string;
  badge?: string;
  highlight?: boolean;
  onSubscribe: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-5 ${
        highlight ? "border-primary bg-primary-subtle/30" : "border-border bg-white"
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <p className="text-sm font-bold text-ink">{label}</p>
      <p className="mt-1.5">
        <span className="font-heading text-2xl font-bold text-ink">Rp {priceIDR.toLocaleString("id-ID")}</span>
        <span className="text-xs text-muted">{priceSuffix}</span>
      </p>
      <button
        type="button"
        onClick={onSubscribe}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? "Menyiapkan pembayaran..." : "Berlangganan"}
      </button>
    </div>
  );
}
