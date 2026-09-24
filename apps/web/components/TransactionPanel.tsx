"use client";

import { FormSkeleton, TableSkeleton } from "@/components/dashboard/feedback/Skeletons";
import { useEffect, useState } from "react";
import { ApiError, OrderDetail, OrderListItem, getOrderDetail, listOrders, markOrderFulfilled, refundOrder } from "@/lib/api-client";
import { confirmAction } from "@/lib/confirm";
import { IconClose, IconInbox } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import StatusBadge from "@/components/dashboard/data/StatusBadge";
import { formatIDR, formatDateTime } from "@/lib/format";
import { useErrorToast } from "@/lib/use-error-toast";

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

// Warna status kini TERPUSAT di StatusBadge (Phase 8 cleanup §25 --
// menggantikan peta kelas hard-coded per-file); label tetap dari
// buildStatusLabels (i18n). Helper format pindah ke lib/format.ts (§24.4).

// Modul Toko (tab Transaction): daftar SEMUA transaksi kreator dengan
// filter status & pencarian, klik baris membuka detail/invoice + tombol
// refund (hanya untuk order berstatus "paid").
export default function TransactionPanel() {
  const { t } = useLocale();
  const STATUS_LABEL = buildStatusLabels(t);
  // Chips status + detail right sheet (SPEC §13.6, Phase 5). Data/mutasi
  // (listOrders/getOrderDetail/refundOrder) tak berubah.
  const [orders, setOrders] = useState<OrderListItem[] | null>(null);
  // hasMore/loadingMore -- ditambahkan lewat audit performa profesional 15
  // September 2026: backend sebelumnya "LIMIT 200" tetap tanpa cara
  // mencapai baris yang lebih lama -- sekarang paginasi sungguhan lewat
  // offset, tombol "Muat lebih banyak" MENAMBAHKAN ke daftar yang sudah
  // ada (bukan mengganti), konsisten dgn ekspektasi pengguna soal daftar
  // yang bertambah panjang, bukan berpindah halaman.
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => {
        setOrders(r.orders);
        setHasMore(r.has_more);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.loadError")));
    // Bug ditemukan 13 September 2026 (laporan pengguna: "diseluruh menu
    // sales" fetch dobel): `t` di sini CUMA dipakai memformat pesan error
    // di .catch(), tidak menentukan APA yang di-fetch -- tidak perlu jadi
    // dependency. Referensi `t` bisa berubah lebih sering dari yang
    // dikira (lihat catatan di useLocale()), memicu fetch order berulang
    // tiap kali itu terjadi walau statusFilter/search tidak berubah sama
    // sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, search]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  function handleRefunded() {
    setSelectedOrderId(null);
    listOrders({ status: statusFilter || undefined, search: search || undefined })
      .then((r) => {
        setOrders(r.orders);
        setHasMore(r.has_more);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.loadError")));
  }

  function handleLoadMore() {
    if (!orders) return;
    setLoadingMore(true);
    listOrders({ status: statusFilter || undefined, search: search || undefined, offset: orders.length })
      .then((r) => {
        setOrders((prev) => [...(prev ?? []), ...r.orders]);
        setHasMore(r.has_more);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.loadError")))
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className="mt-4">

      <div className="mb-3 flex flex-wrap gap-2">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("dashboard.components.transactionPanel.searchPlaceholder")}
            className="rounded-lg border border-app-border px-3 py-1.5 text-xs text-app-ink"
          />
          <button type="submit" className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple">
            {t("dashboard.components.transactionPanel.searchButton")}
          </button>
        </form>
        {/* Chips ringkasan status (SPEC §13.6) menggantikan dropdown --
            filter satu-klik yang terlihat, bukan tersembunyi di select. */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("dashboard.components.transactionPanel.columnStatus")}>
          {["", "paid", "pending", "refunded", "expired", "failed"].map((st) => (
            <button
              key={st || "all"}
              type="button"
              onClick={() => setStatusFilter(st)}
              aria-pressed={statusFilter === st}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
                  : "border-app-border text-app-muted hover:border-jeon-purple/50"
              }`}
            >
              {st === "" ? t("dashboard.components.transactionPanel.allStatusOption") : STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </div>

      {orders === null ? (
        // TableSkeleton (bukan PageSkeleton) -- laporan pengguna 3 September
        // 2026: "terasa loading 2x". Tab ini dimuat lewat next/dynamic
        // (import() di products/page.tsx) SETELAH chrome halaman produk
        // sudah tampil; PageSkeleton di sini menduplikasi bentuk skeleton
        // rute awal persis, terlihat seperti halaman memuat ulang dari nol.
        // Bentuk tabel di bawah ini meniru tabel sungguhan yang akan tampil.
        <TableSkeleton rows={6} cols={5} />
      ) : (
        <div className="glass overflow-x-auto rounded-jmd shadow-card">
          <table aria-label={t("dashboard.components.transactionPanel.tableAriaLabel")} className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b-2 border-jeon-ink text-[11px] font-semibold uppercase tracking-wide text-app-muted">
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
                  {/* buyer_name -- migrasi 000102, permintaan langsung
                      pengguna 15 September 2026. Order LAMA (sebelum
                      migrasi ini) bernilai "" -- jatuh balik ke email
                      SAJA persis seperti tampilan lama, tidak ada baris
                      kedua kosong yang aneh. */}
                  <td className="px-4 py-3 text-app-ink">
                    {o.buyer_name ? (
                      <>
                        <p className="font-semibold">{o.buyer_name}</p>
                        <p className="text-[11px] text-app-muted">{o.buyer_email}</p>
                      </>
                    ) : (
                      o.buyer_email
                    )}
                  </td>
                  <td className="px-4 py-3 text-app-ink">{formatIDR(o.amount_idr)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} label={STATUS_LABEL[o.status] ?? o.status} className="text-[10px]" />
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
          {hasMore && (
            <div className="flex justify-center border-t border-app-border p-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={handleLoadMore}
                className="rounded-lg border-2 border-jeon-ink px-4 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple disabled:opacity-60"
              >
                {loadingMore ? t("dashboard.components.transactionPanel.loadingMore") : t("dashboard.components.transactionPanel.loadMore")}
              </button>
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
  // Detail order = RIGHT SHEET selebar max-md menempel kanan (ruang
  // vertikal penuh utk timeline/ledger) -- SPEC §13.6.
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [markingFulfilled, setMarkingFulfilled] = useState(false);

  // handleMarkFulfilled -- DITAMBAHKAN 24 September 2026. Untuk produk
  // dengan metode pengiriman "manual", halaman status pembeli menampilkan
  // "Pesananmu akan diproses & dikirim langsung oleh penjual. Mohon tunggu"
  // sampai fulfilled_at terisi, lalu berganti "Sudah diproses penjual pada
  // ...". Backend-nya (POST /dashboard/orders/:id/fulfill) sudah lama ada,
  // tapi TIDAK ADA satu pun UI untuk memanggilnya -- jadi pembeli melihat
  // "Mohon tunggu" SELAMANYA walau kreator sudah benar-benar mengirim.
  // Audit kode mati menandai markOrderFulfilled sebagai tak terpakai; yang
  // hilang sebenarnya tombolnya, bukan fungsinya.
  async function handleMarkFulfilled() {
    if (!detail) return;
    const ok = await confirmAction(t("dashboard.components.transactionPanel.markFulfilledConfirm"), {
      title: t("dashboard.components.transactionPanel.markFulfilledButton"),
      confirmButtonText: t("dashboard.components.transactionPanel.markFulfilledButton"),
    });
    if (!ok) return;
    setMarkingFulfilled(true);
    try {
      await markOrderFulfilled(detail.order_id);
      const refreshed = await getOrderDetail(detail.order_id);
      setDetail(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.markFulfilledError"));
    } finally {
      setMarkingFulfilled(false);
    }
  }

  useEffect(() => {
    getOrderDetail(orderId)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.transactionPanel.detailLoadError")));
    // Sama seperti efek listOrders di atas -- `t` cuma dipakai format
    // pesan error, bukan penentu data yang diambil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

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
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("dashboard.components.transactionPanel.detailTitle")}
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-2 border-jeon-ink bg-app-surface p-6 shadow-brutal"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-app-muted hover:bg-jeon-purple/10"
          aria-label={t("dashboard.components.transactionPanel.closeLabel")}
        >
          <IconClose className="h-4 w-4" />
        </button>


        {detail === null ? (
          // FormSkeleton (bukan PageSkeleton) -- panel ini modal KECIL;
          // PageSkeleton (dibuat utk lebar halaman penuh) memaksa modal
          // melompat jauh lebih tinggi lalu menyusut saat data asli datang --
          // lompatan tinggi itu sendiri terasa seperti "memuat ulang".
          <FormSkeleton fields={5} />
        ) : (
          <>
            <p className="font-display text-sm font-bold text-app-ink">{t("dashboard.components.transactionPanel.detailTitle")}</p>
            <p className="mt-0.5 truncate text-xs text-app-muted">{detail.order_id}</p>

            <div className="mt-4 flex flex-col gap-1.5 text-xs">
              <Row label={t("dashboard.components.transactionPanel.rowProduct")} value={detail.product_name} />
              {/* buyer_name -- migrasi 000102, permintaan langsung pengguna
                  15 September 2026. Order LAMA (sebelum migrasi ini)
                  bernilai "" -- disembunyikan sepenuhnya drpd menampilkan
                  baris kosong. */}
              {detail.buyer_name && <Row label={t("dashboard.components.transactionPanel.rowBuyerName")} value={detail.buyer_name} />}
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
              {/* Syaratnya sama persis dengan WHERE di MarkFulfilled (backend):
                  metode manual, sudah lunas, belum pernah ditandai. */}
              {detail.delivery_method === "manual" && detail.status === "paid" && !detail.fulfilled_at && (
                <button
                  type="button"
                  onClick={handleMarkFulfilled}
                  disabled={markingFulfilled}
                  className="btn-primary mt-2 w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {markingFulfilled ? "..." : t("dashboard.components.transactionPanel.markFulfilledButton")}
                </button>
              )}
              {detail.refunded_at && (
                <>
                  <Row label={t("dashboard.components.transactionPanel.rowRefundedAt")} value={formatDateTime(detail.refunded_at)} />
                  <Row label={t("dashboard.components.transactionPanel.rowRefundAmount")} value={formatIDR(detail.refund_amount_idr ?? 0)} />
                  {detail.refund_reason && <Row label={t("dashboard.components.transactionPanel.rowRefundReason")} value={detail.refund_reason} />}
                </>
              )}
            </div>

            {/* buyer_note -- migrasi 000102, permintaan langsung pengguna
                15 September 2026. Blok terpisah (bukan Row) -- catatan
                bebas bisa cukup panjang (maks 1000 karakter), tidak cocok
                dipaksa masuk baris label-kiri/nilai-kanan yang sempit. */}
            {detail.buyer_note && (
              <div className="mt-3 rounded-md border border-app-border bg-app-surface-2 p-2.5">
                <p className="text-[11px] font-semibold text-app-muted">{t("dashboard.components.transactionPanel.rowBuyerNote")}</p>
                <p className="mt-0.5 whitespace-pre-line text-xs text-app-ink">{detail.buyer_note}</p>
              </div>
            )}

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
                        className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-semibold text-app-ink"
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
