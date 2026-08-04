"use client";

import { useEffect, useState } from "react";
import { AnalyticsSummary, RecentOrder, getBalance } from "@/lib/api-client";
import { IconBox, IconChart, IconInbox, IconTrendArrow, IconWallet } from "@/components/icons";

// ShopOverviewPanel -- ringkasan performa Toko (Transaksi, Pendapatan,
// grafik 7 hari, Produk Terlaris, Transaksi Terbaru), dipakai di DUA
// tempat: tab "Toko" pada /dashboard/statistik, dan tab "Overview" pada
// /dashboard/products (Toko) -- diekstrak ke sini supaya kedua tempat itu
// selalu menampilkan angka yang identik dari satu sumber logika, bukan dua
// salinan yang bisa perlahan berbeda.
//
// Saldo (Withdrawal Amount pada referensi) diambil SENDIRI lewat
// getBalance() di sini (bukan prop) -- kedua pemanggil butuh angka yang
// sama, mengambilnya sendiri sekali di sini lebih sederhana daripada
// menduplikasi pemanggilan di 2 tempat.
const WEEKDAY_LABEL = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const ORDER_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  paid: { label: "Lunas", className: "bg-secondary-subtle text-secondary-dark" },
  pending: { label: "Menunggu", className: "bg-amber-50 text-amber-700" },
  expired: { label: "Kedaluwarsa", className: "bg-gray-100 text-muted" },
  failed: { label: "Gagal", className: "bg-red-50 text-red-600" },
};

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function ShopOverviewPanel({ summary, recentOrders }: { summary: AnalyticsSummary; recentOrders: RecentOrder[] | null }) {
  const weeklyMax = Math.max(1, ...summary.weekly_revenue.map((d) => d.revenue_idr));
  const [availableIDR, setAvailableIDR] = useState<number | null>(null);

  useEffect(() => {
    getBalance()
      .then((b) => setAvailableIDR(b.available_idr))
      .catch(() => {
        // Fail-silent -- kartu saldo cukup disembunyikan kalau gagal dimuat,
        // bukan menggagalkan seluruh panel Overview.
      });
  }, []);

  // conversionRate -- total_orders (LUNAS) / total_checkouts (order dibuat,
  // status apa pun) -- lihat catatan lingkup di AnalyticsSummary.
  const conversionRate = summary.total_checkouts > 0 ? (summary.total_orders / summary.total_checkouts) * 100 : null;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard icon={<IconBox className="h-4 w-4 text-secondary-dark" />} label="Transaksi" value={summary.total_orders.toLocaleString("id-ID")} />
        <StatCard icon={<IconWallet className="h-4 w-4 text-primary" />} label="Pendapatan" value={formatRupiah(summary.total_revenue_idr)} />
        {availableIDR !== null && (
          <StatCard icon={<IconWallet className="h-4 w-4 text-secondary-dark" />} label="Saldo Tersedia" value={formatRupiah(availableIDR)} />
        )}
        <StatCard icon={<IconChart className="h-4 w-4 text-accent-dark" />} label="Klik Beli" value={summary.total_product_clicks.toLocaleString("id-ID")} />
        <StatCard icon={<IconBox className="h-4 w-4 text-primary" />} label="Checkout" value={summary.total_checkouts.toLocaleString("id-ID")} />
        <StatCard
          icon={<IconTrendArrow className="h-4 w-4 text-secondary-dark" />}
          label="Tingkat Konversi"
          value={conversionRate !== null ? `${conversionRate.toFixed(1)}%` : "--"}
        />
      </section>
      <p className="mt-2 text-[11px] text-muted">
        Checkout = pembeli sampai ke proses bayar (lunas atau tidak). Tingkat Konversi = Transaksi lunas &divide; Checkout.
      </p>

      <div className="mt-3 rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-ink">Pendapatan 7 Hari Terakhir</h2>
        <p className="mt-2 font-heading text-xl font-bold text-ink">{formatRupiah(summary.weekly_revenue_total_idr)}</p>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 100 }}>
          {summary.weekly_revenue.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${formatRupiah(d.revenue_idr)}`}>
              <div className="w-full rounded-t bg-secondary transition-all" style={{ height: `${Math.max(4, (d.revenue_idr / weeklyMax) * 80)}px` }} />
              <span className="text-[10px] text-muted">{WEEKDAY_LABEL[new Date(d.date + "T00:00:00Z").getUTCDay()]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-ink">Produk Terlaris</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {summary.top_products.map((p) => (
            <li key={p.product_id} className="flex justify-between text-xs">
              <span className="truncate text-ink">{p.name}</span>
              <span className="ml-2 flex-shrink-0 font-semibold text-secondary-dark">
                {p.sold_count} terjual &middot; {formatRupiah(p.revenue_idr)}
              </span>
            </li>
          ))}
          {summary.top_products.length === 0 && <EmptyRow text="Belum ada penjualan." />}
        </ul>
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-ink">Transaksi Terbaru</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(recentOrders ?? []).map((o) => {
            const statusMeta = ORDER_STATUS_LABEL[o.status] ?? { label: o.status, className: "bg-gray-100 text-muted" };
            return (
              <li key={o.order_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink">{o.product_name}</span>
                <span className="flex-shrink-0 font-semibold text-ink">{formatRupiah(o.amount_idr)}</span>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>{statusMeta.label}</span>
              </li>
            );
          })}
          {(recentOrders ?? []).length === 0 && <EmptyRow text="Belum ada transaksi." />}
        </ul>
      </div>
    </>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-heading text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center justify-center gap-2 py-2 text-center text-xs text-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}
