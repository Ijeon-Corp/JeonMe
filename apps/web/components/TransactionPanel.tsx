"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, OrderDetail, OrderListItem, getOrderDetail, listOrders, refundOrder } from "@/lib/api-client";
import { IconClose, IconInbox } from "@/components/icons";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  paid: "Lunas",
  expired: "Kedaluwarsa",
  failed: "Gagal",
  refunded: "Direfund",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600",
  paid: "bg-secondary-subtle text-secondary-dark",
  expired: "bg-gray-100 text-muted",
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
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => setOrders(r.orders))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat transaksi."));
  }, [statusFilter, search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleRefunded() {
    setSelectedOrderId(null);
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => setOrders(r.orders))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat transaksi."));
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari email pembeli atau nama produk..."
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink"
          />
          <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary">
            Cari
          </button>
        </form>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-ink"
        >
          <option value="">Semua Status</option>
          <option value="paid">Lunas</option>
          <option value="pending">Menunggu</option>
          <option value="refunded">Direfund</option>
          <option value="expired">Kedaluwarsa</option>
          <option value="failed">Gagal</option>
        </select>
      </div>

      {orders === null ? (
        <PageSkeleton />
      ) : (
        <div className="glass overflow-x-auto rounded-2xl shadow-card">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Produk</th>
                <th className="px-4 py-3">Pembeli</th>
                <th className="px-4 py-3">Jumlah</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.order_id}
                  onClick={() => setSelectedOrderId(o.order_id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-primary-subtle/40"
                >
                  <td className="px-4 py-3 font-semibold text-ink">{o.product_name}</td>
                  <td className="px-4 py-3 text-ink">{o.buyer_email}</td>
                  <td className="px-4 py-3 text-ink">{formatIDR(o.amount_idr)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[o.status] ?? "bg-gray-100 text-muted"}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <IconInbox className="h-5 w-5 text-muted" />
              <p className="text-xs text-muted">Belum ada transaksi.</p>
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
      <span className="text-muted">{label}</span>
      <span className="text-right font-semibold text-ink">{value}</span>
    </div>
  );
}

function OrderDetailModal({ orderId, onClose, onRefunded }: { orderId: string; onClose: () => void; onRefunded: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getOrderDetail(orderId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat detail transaksi."));
  }, [orderId]);

  async function handleRefund() {
    setRefunding(true);
    setError(null);
    try {
      await refundOrder(orderId, reason);
      onRefunded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses refund.");
      setRefunding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-hero">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-primary-subtle"
          aria-label="Tutup"
        >
          <IconClose className="h-4 w-4" />
        </button>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {detail === null ? (
          <PageSkeleton />
        ) : (
          <>
            <p className="font-heading text-sm font-bold text-ink">Detail Transaksi</p>
            <p className="mt-0.5 truncate text-xs text-muted">{detail.order_id}</p>

            <div className="mt-4 flex flex-col gap-1.5 text-xs">
              <Row label="Produk" value={detail.product_name} />
              <Row label="Pembeli" value={detail.buyer_email} />
              {detail.buyer_contact && <Row label="Kontak" value={detail.buyer_contact} />}
              <Row label="Jumlah" value={formatIDR(detail.amount_idr)} />
              {detail.discount_idr > 0 && <Row label="Diskon Voucher" value={`-${formatIDR(detail.discount_idr)}`} />}
              <Row label="Biaya Platform" value={formatIDR(detail.platform_fee_idr)} />
              {detail.affiliate_commission_idr > 0 && (
                <Row label="Komisi Afiliasi" value={formatIDR(detail.affiliate_commission_idr)} />
              )}
              {detail.payment_method && <Row label="Metode Bayar" value={detail.payment_method} />}
              <Row label="Status" value={STATUS_LABEL[detail.status] ?? detail.status} />
              <Row label="Waktu" value={formatDateTime(detail.created_at)} />
              {detail.fulfilled_at && <Row label="Selesai Diproses" value={formatDateTime(detail.fulfilled_at)} />}
              {detail.refunded_at && (
                <>
                  <Row label="Direfund" value={formatDateTime(detail.refunded_at)} />
                  <Row label="Jumlah Refund" value={formatIDR(detail.refund_amount_idr ?? 0)} />
                  {detail.refund_reason && <Row label="Alasan Refund" value={detail.refund_reason} />}
                </>
              )}
            </div>

            {detail.ledger_entries.length > 0 && (
              <div className="mt-4 rounded-xl border border-border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Riwayat Saldo dari Transaksi Ini</p>
                <div className="mt-1.5 flex flex-col gap-1">
                  {detail.ledger_entries.map((l, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-muted">{l.type === "credit" ? "Masuk" : l.type === "refund_debit" ? "Refund" : l.type}</span>
                      <span className={`font-semibold ${l.amount_idr < 0 ? "text-red-600" : "text-ink"}`}>
                        {l.amount_idr < 0 ? "-" : "+"}
                        {formatIDR(Math.abs(l.amount_idr))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.status === "paid" && (
              <div className="mt-5 border-t border-border pt-4">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="w-full rounded-lg border border-red-200 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Refund Pesanan Ini
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-muted">Alasan refund (opsional)</label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={200}
                      rows={2}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-ink"
                      placeholder="Contoh: pembeli komplain, salah beli, dsb"
                    />
                    <p className="text-[11px] text-red-600">
                      Uang pembeli akan dikembalikan penuh lewat Midtrans. Tindakan ini tidak bisa dibatalkan.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={refunding}
                        onClick={handleRefund}
                        className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {refunding ? "Memproses..." : "Ya, Refund Sekarang"}
                      </button>
                      <button
                        type="button"
                        disabled={refunding}
                        onClick={() => setConfirming(false)}
                        className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold text-ink"
                      >
                        Batal
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
