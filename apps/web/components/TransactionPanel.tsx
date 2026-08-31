"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, OrderDetail, OrderListItem, getOrderDetail, listOrders, refundOrder } from "@/lib/api-client";
import { IconClose, IconInbox } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// buildStatusLabel -- status pesanan dipakai di 3 tempat (badge tabel,
// opsi filter dropdown, detail modal), dibangun lewat t() supaya ikut
// berganti bahasa, mengikuti pola buildNavItems() di dashboard/layout.tsx
// (fungsi dipanggil ulang tiap render, bukan konstanta modul lagi).
function buildStatusLabels(t: (key: string) => string): Record<string, string> {
  return {
    pending: t("dashboard.components.transactionPanel.statusLabels.pending"),
    paid: t("dashboard.components.transactionPanel.statusLabels.paid"),
    expired: t("dashboard.components.transactionPanel.statusLabels.expired"),
    failed: t("dashboard.components.transactionPanel.statusLabels.failed"),
    refunded: t("dashboard.components.transactionPanel.statusLabels.refunded"),
  };
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  paid: "bg-jeon-purple/10 text-jeon-purple",
  expired: "bg-gray-100 text-app-muted",
  failed: "bg-red-50 text-red-600",
  refunded: "bg-blue-50 text-blue-600",
};

function formatIDR(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

// Modul Toko (tab Transaction): daftar SEMUA transaksi kreator dengan
// filter status & pencarian, klik baris membuka detail/invoice + tombol
// refund (hanya untuk order berstatus "paid").
export default function TransactionPanel() {
  const { t } = useLocale();
  const STATUS_LABEL = buildStatusLabels(t);
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => setOrders(r.orders))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.loadError")));
  }, [statusFilter, search, t]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleRefunded() {
    setSelectedOrderId(null);
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => setOrders(r.orders))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.loadError")));
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("dashboard.components.transactionPanel.searchPlaceholder")}
            className="rounded-lg border border-app-border px-3 py-1.5 text-xs text-app-ink"
          />
          <button type="submit" className="rounded-lg border border-app-border px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple">
            {t("dashboard.components.transactionPanel.searchButton")}
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-app-border px-3 py-1.5 text-xs text-app-ink"
        >
          <option value="">{t("dashboard.components.transactionPanel.allStatusOption")}</option>
          <option value="paid">{STATUS_LABEL.paid}</option>
          <option value="pending">{STATUS_LABEL.pending}</option>
          <option value="refunded">{STATUS_LABEL.refunded}</option>
          <option value="expired">{STATUS_LABEL.expired}</option>
          <option value="failed">{STATUS_LABEL.failed}</option>
        </select>
      </div>

      {orders === null ? (
        <PageSkeleton />
      ) : (
        <div className="glass overflow-x-auto rounded-jmd shadow-card">
          <table aria-label={t("dashboard.components.transactionPanel.tableAriaLabel")} className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-app-border text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                <th className="px-4 py-3">{t("dashboard.components.transactionPanel.columnProduct")}</th>
                <th className="px-4 py-3">{t("dashboard.components.transactionPanel.columnBuyer")}</th>
                <th className="px-4 py-3">{t("dashboard.components.transactionPanel.columnAmount")}</th>
                <th className="px-4 py-3">{t("dashboard.components.transactionPanel.columnStatus")}</th>
                <th className="px-4 py-3">{t("dashboard.components.transactionPanel.columnTime")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.order_id}
                  onClick={() => setSelectedOrderId(o.order_id)}
                  className="cursor-pointer border-b border-app-border last:border-0 hover:bg-jeon-purple/5"
                >
                  <td className="px-4 py-3 font-semibold text-app-ink">{o.product_name}</td>
                  <td className="px-4 py-3 text-app-ink">{o.buyer_email}</td>
                  <td className="px-4 py-3 text-app-ink">{formatIDR(o.amount_idr)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-app-muted"}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-app-muted">{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <IconInbox className="h-5 w-5 text-app-muted" />
              <p className="text-xs text-app-muted">{t("dashboard.components.transactionPanel.emptyState")}</p>
            </div>
          )}
        </div>
      )}

      {selectedOrderId && (
        <OrderDetailModal orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onRefunded={handleRefunded} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-app-muted">{label}</span>
      <span className="text-right font-semibold text-app-ink">{value}</span>
    </div>
  );
}

function OrderDetailModal({ orderId, onClose, onRefunded }: { orderId: string; onClose: () => void; onRefunded: () => void }) {
  const { t } = useLocale();
  const STATUS_LABEL = buildStatusLabels(t);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getOrderDetail(orderId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.detailLoadError")));
  }, [orderId, t]);

  async function handleRefund() {
    setRefunding(true);
    setError(null);
    try {
      await refundOrder(orderId, reason);
      onRefunded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.refundError"));
      setRefunding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-jmd bg-app-surface p-6 shadow-hero">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-app-muted hover:bg-jeon-purple/10"
          aria-label={t("dashboard.components.transactionPanel.closeLabel")}
        >
          <IconClose className="h-4 w-4" />
        </button>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {detail === null ? (
          <PageSkeleton />
        ) : (
          <>
            <p className="font-display text-sm font-bold text-app-ink">{t("dashboard.components.transactionPanel.detailTitle")}</p>
            <p className="mt-0.5 truncate text-xs text-app-muted">{detail.order_id}</p>

            <div className="mt-4 flex flex-col gap-1.5 text-xs">
              <Row label={t("dashboard.components.transactionPanel.rowProduct")} value={detail.product_name} />
              <Row label={t("dashboard.components.transactionPanel.rowBuyer")} value={detail.buyer_email} />
              {detail.buyer_contact && <Row label={t("dashboard.components.transactionPanel.rowContact")} value={detail.buyer_contact} />}
              <Row label={t("dashboard.components.transactionPanel.rowAmount")} value={formatIDR(detail.amount_idr)} />
              {detail.discount_idr > 0 && (
                <Row label={t("dashboard.components.transactionPanel.rowDiscountVoucher")} value={`-${formatIDR(detail.discount_idr)}`} />
              )}
              <Row label={t("dashboard.components.transactionPanel.rowPlatformFee")} value={formatIDR(detail.platform_fee_idr)} />
              {detail.affiliate_commission_idr > 0 && (
                <Row label={t("dashboard.components.transactionPanel.rowAffiliateCommission")} value={formatIDR(detail.affiliate_commission_idr)} />
              )}
              {detail.payment_method && <Row label={t("dashboard.components.transactionPanel.rowPaymentMethod")} value={detail.payment_method} />}
              <Row label={t("dashboard.components.transactionPanel.rowStatus")} value={STATUS_LABEL[detail.status] ?? detail.status} />
              <Row label={t("dashboard.components.transactionPanel.rowTime")} value={formatDateTime(detail.created_at)} />
              {detail.fulfilled_at && (
                <Row label={t("dashboard.components.transactionPanel.rowFulfilledAt")} value={formatDateTime(detail.fulfilled_at)} />
              )}
              {detail.refunded_at && (
                <>
                  <Row label={t("dashboard.components.transactionPanel.rowRefundedAt")} value={formatDateTime(detail.refunded_at)} />
                  <Row label={t("dashboard.components.transactionPanel.rowRefundAmount")} value={formatIDR(detail.refund_amount_idr ?? 0)} />
                  {detail.refund_reason && <Row label={t("dashboard.components.transactionPanel.rowRefundReason")} value={detail.refund_reason} />}
                </>
              )}
            </div>

            {detail.ledger_entries.length > 0 && (
              <div className="mt-4 rounded-xl border border-app-border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                  {t("dashboard.components.transactionPanel.ledgerTitle")}
                </p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {detail.ledger_entries.map((l, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-app-muted">
                        {l.type === "credit"
                          ? t("dashboard.components.transactionPanel.ledgerCredit")
                          : l.type === "refund_debit"
                            ? t("dashboard.components.transactionPanel.ledgerRefundDebit")
                            : l.type}
                      </span>
                      <span className={`font-semibold ${l.amount_idr < 0 ? "text-red-600" : "text-app-ink"}`}>
                        {l.amount_idr < 0 ? "-" : "+"}
                        {formatIDR(Math.abs(l.amount_idr))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.status === "paid" && (
              <div className="mt-5 border-t border-app-border pt-4">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="w-full rounded-lg border border-red-200 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    {t("dashboard.components.transactionPanel.refundButton")}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-app-muted">
                      {t("dashboard.components.transactionPanel.refundReasonLabel")}
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      rows={2}
                      className="rounded-lg border border-app-border px-3 py-2 text-xs text-app-ink"
                      placeholder={t("dashboard.components.transactionPanel.refundReasonPlaceholder")}
                    />
                    <p className="text-[11px] text-red-600">{t("dashboard.components.transactionPanel.refundWarning")}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={refunding}
                        onClick={handleRefund}
                        className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {refunding
                          ? t("dashboard.components.transactionPanel.processingLabel")
                          : t("dashboard.components.transactionPanel.confirmRefundButton")}
                      </button>
                      <button
                        type="button"
                        disabled={refunding}
                        onClick={() => setConfirming(false)}
                        className="flex-1 rounded-lg border border-app-border py-2 text-xs font-semibold text-app-ink"
                      >
                        {t("dashboard.components.transactionPanel.cancelButton")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
