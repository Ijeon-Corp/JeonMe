"use client";

import { useEffect, useState } from "react";
import { AnalyticsSummary, RecentOrder, getBalance } from "@/lib/api-client";
import { IconBox, IconChart, IconInbox, IconTrendArrow, IconWallet } from "@/components/icons";
import StatCard from "@/components/StatCard";
import { useLocale } from "@/lib/locale-context";

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
// buildOrderStatusLabels -- sama seperti buildStatusLabels di
// TransactionPanel.tsx (dipanggil ulang tiap render lewat t(), bukan
// konstanta modul lagi) supaya ikut berganti bahasa.
function buildOrderStatusLabels(t: (key: string) => string): Record<string, { label: string; className: string }> {
  return {
    paid: { label: t("dashboard.components.shopOverviewPanel.statusLabels.paid"), className: "bg-jeon-purple/10 text-jeon-purple" },
    pending: { label: t("dashboard.components.shopOverviewPanel.statusLabels.pending"), className: "bg-amber-50 text-amber-700" },
    expired: { label: t("dashboard.components.shopOverviewPanel.statusLabels.expired"), className: "bg-gray-100 text-app-muted" },
    failed: { label: t("dashboard.components.shopOverviewPanel.statusLabels.failed"), className: "bg-red-50 text-red-600" },
  };
}

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function ShopOverviewPanel({ summary, recentOrders }: { summary: AnalyticsSummary; recentOrders: RecentOrder[] | null }) {
  const { t } = useLocale();
  const ORDER_STATUS_LABEL = buildOrderStatusLabels(t);
  // weekdayLabel -- lewat t() dengan path dinamis (bukan akses langsung
  // dict.xxx) supaya tetap type-check WALAU dictionaries.ts belum berisi
  // key ini (t() cuma menerima string apa pun, lihat catatan mekanisme di
  // signature useLocale()).
  const weekdayLabel = [0, 1, 2, 3, 4, 5, 6].map((i) => t(`dashboard.components.shopOverviewPanel.weekdayLabels.${i}`));
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
        <StatCard
          tone="blue"
          icon={<IconBox className="h-4 w-4" />}
          label={t("dashboard.components.shopOverviewPanel.statTransactions")}
          value={summary.total_orders.toLocaleString("id-ID")}
          sub=""
        />
        <StatCard
          tone="brand"
          icon={<IconWallet className="h-4 w-4" />}
          label={t("dashboard.components.shopOverviewPanel.statRevenue")}
          value={formatRupiah(summary.total_revenue_idr)}
          sub=""
        />
        {availableIDR !== null && (
          <StatCard
            tone="lilac"
            icon={<IconWallet className="h-4 w-4" />}
            label={t("dashboard.components.shopOverviewPanel.statAvailableBalance")}
            value={formatRupiah(availableIDR)}
            sub=""
          />
        )}
        <StatCard
          tone="yellow"
          icon={<IconChart className="h-4 w-4" />}
          label={t("dashboard.components.shopOverviewPanel.statProductClicks")}
          value={summary.total_product_clicks.toLocaleString("id-ID")}
          sub=""
        />
        <StatCard
          tone="pink"
          icon={<IconBox className="h-4 w-4" />}
          label={t("dashboard.components.shopOverviewPanel.statCheckout")}
          value={summary.total_checkouts.toLocaleString("id-ID")}
          sub=""
        />
        <StatCard
          tone="blue"
          icon={<IconTrendArrow className="h-4 w-4" />}
          label={t("dashboard.components.shopOverviewPanel.statConversionRate")}
          value={conversionRate !== null ? `${conversionRate.toFixed(1)}%` : "--"}
          sub=""
        />
      </section>
      <p className="mt-2 text-[11px] text-app-muted">{t("dashboard.components.shopOverviewPanel.conversionHint")}</p>

      <div className="glass mt-3 rounded-3xl p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.components.shopOverviewPanel.weeklyRevenueTitle")}</h2>
        <p className="mt-2 font-heading text-xl font-bold text-app-ink">{formatRupiah(summary.weekly_revenue_total_idr)}</p>
        <div className="mt-4 flex items-end gap-1.5" style={{ height: 100 }}>
          {summary.weekly_revenue.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.date}: ${formatRupiah(d.revenue_idr)}`}>
              <div className="w-full rounded-t bg-jeon-purple transition-all" style={{ height: `${Math.max(4, (d.revenue_idr / weeklyMax) * 80)}px` }} />
              <span className="text-[10px] text-app-muted">{weekdayLabel[new Date(d.date + "T00:00:00Z").getUTCDay()]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="glass mt-3 rounded-3xl p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.components.shopOverviewPanel.topProductsTitle")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {summary.top_products.map((p) => (
            <li key={p.product_id} className="flex justify-between text-xs">
              <span className="truncate text-app-ink">{p.name}</span>
              <span className="ml-2 flex-shrink-0 font-semibold text-jeon-purple">
                {p.sold_count} {t("dashboard.components.shopOverviewPanel.soldCountSuffix")} &middot; {formatRupiah(p.revenue_idr)}
              </span>
            </li>
          ))}
          {summary.top_products.length === 0 && <EmptyRow text={t("dashboard.components.shopOverviewPanel.emptyTopProducts")} />}
        </ul>
      </div>

      <div className="glass mt-3 rounded-3xl p-4 shadow-card">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.components.shopOverviewPanel.recentTransactionsTitle")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {(recentOrders ?? []).map((o) => {
            const statusMeta = ORDER_STATUS_LABEL[o.status] ?? { label: o.status, className: "bg-gray-100 text-app-muted" };
            return (
              <li key={o.order_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-app-ink">{o.product_name}</span>
                <span className="flex-shrink-0 font-semibold text-app-ink">{formatRupiah(o.amount_idr)}</span>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}>{statusMeta.label}</span>
              </li>
            );
          })}
          {(recentOrders ?? []).length === 0 && <EmptyRow text={t("dashboard.components.shopOverviewPanel.emptyRecentTransactions")} />}
        </ul>
      </div>
    </>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <li className="flex items-center justify-center gap-2 py-2 text-center text-xs text-app-muted">
      <IconInbox className="h-3.5 w-3.5 flex-shrink-0" />
      {text}
    </li>
  );
}
