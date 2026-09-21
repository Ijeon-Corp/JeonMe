"use client";

import { useEffect, useState } from "react";
import { AdminPayout, ApiError, listAdminPayouts, updatePayoutStatus } from "@/lib/api-client";
import { IconInbox, IconWallet } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import { useErrorToast } from "@/lib/use-error-toast";

const STATUS_LABEL: Record<AdminPayout["status"], string> = {
  requested: "Diajukan",
  processing: "Diproses",
  completed: "Berhasil",
  failed: "Gagal",
};

const STATUS_BADGE: Record<AdminPayout["status"], string> = {
  requested: "bg-jeon-warning/15 text-jeon-warning",
  processing: "bg-jeon-purple/10 text-jeon-purple",
  completed: "bg-jeon-purple/10 text-jeon-purple",
  failed: "bg-red-50 text-red-600",
};

const PAGE_SIZE = 50;

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"needs_action" | "all">("needs_action");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload(f: "needs_action" | "all", offset = 0) {
    return listAdminPayouts({ status: f, limit: PAGE_SIZE, offset }).then((res) => {
      setTotal(res.total);
      if (offset === 0) setPayouts(res.items);
      else setPayouts((prev) => [...prev, ...res.items]);
    });
  }

  function handleFilterChange(f: "needs_action" | "all") {
    setFilter(f);
    setLoading(true);
  }

  useEffect(() => {
    reload(filter)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat penarikan."))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleLoadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      await reload(filter, payouts.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat penarikan lainnya.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleUpdateStatus(payout: AdminPayout, status: "processing" | "completed" | "failed") {
    // Bug UI/UX ditemukan 21 September 2026 (audit menyeluruh): SEBELUMNYA
    // hanya "failed" (aksi paling MUDAH dipulihkan -- saldo dikembalikan
    // otomatis) yang dikonfirmasi, sementara "processing"/"completed" --
    // terutama "completed" yang ATESTASI dana sudah benar-benar ditransfer
    // manual di luar sistem & TIDAK reversibel dari UI ini -- tidak punya
    // konfirmasi sama sekali. Terbalik dari yang seharusnya.
    if (status === "failed") {
      const confirmed = await confirmAction(
        `Tandai penarikan Rp${payout.amount_idr.toLocaleString("id-ID")} milik @${payout.username} sebagai GAGAL? Saldo akan dikembalikan ke kreator.`,
        { confirmButtonText: "Ya, Tandai Gagal" }
      );
      if (!confirmed) return;
    } else if (status === "completed") {
      const confirmed = await confirmAction(
        `Tandai penarikan Rp${payout.amount_idr.toLocaleString("id-ID")} milik @${payout.username} SELESAI? Pastikan dana SUDAH benar-benar ditransfer -- aksi ini tidak bisa dibatalkan dari sini.`,
        { title: "Konfirmasi transfer dana", confirmButtonText: "Ya, Sudah Ditransfer" }
      );
      if (!confirmed) return;
    } else if (status === "processing") {
      const confirmed = await confirmAction(
        `Mulai proses penarikan Rp${payout.amount_idr.toLocaleString("id-ID")} milik @${payout.username}?`,
        { confirmButtonText: "Ya, Proses" }
      );
      if (!confirmed) return;
    }
    setError(null);
    setBusyId(payout.id);
    try {
      await updatePayoutStatus(payout.id, status);
      await reload(filter, 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status penarikan.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-app-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Penarikan Dana</h1>
      <p className="mt-1 text-sm text-app-muted">
        Proses pengajuan penarikan kreator secara manual -- transfer dana dilakukan di luar sistem
        (mis. internet banking), lalu tandai statusnya di sini. Kreator dengan KYC terverifikasi
        ditampilkan lebih dulu supaya diproses lebih cepat.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => handleFilterChange("needs_action")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "needs_action"
              ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-app-border text-app-muted hover:border-jeon-purple/50"
          }`}
        >
          Perlu Tindakan
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "all"
              ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-app-border text-app-muted hover:border-jeon-purple/50"
          }`}
        >
          Semua Riwayat
        </button>
      </div>


      <div className="mt-4 flex flex-col gap-2">
        {payouts.map((p) => (
          <div key={p.id} className="rounded-xl border-2 border-jeon-ink bg-app-surface p-4 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                  <IconWallet className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-app-ink">
                    Rp {p.amount_idr.toLocaleString("id-ID")}
                    <span className="ml-2 font-normal text-app-muted">
                      @{p.username} ({p.email})
                    </span>
                  </p>
                  <p className="text-xs text-app-muted">{p.destination_account}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {p.kyc_status_at_request === "verified" && (
                  <span className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-2.5 py-1 text-xs font-semibold text-[#111111]">
                    KYC Terverifikasi
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[p.status]}`}>
                  {STATUS_LABEL[p.status]}
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-app-muted">
                Diajukan {new Date(p.requested_at).toLocaleString("id-ID")}
              </span>

              {p.status === "requested" && (
                <>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => handleUpdateStatus(p, "processing")}
                    className="font-semibold text-jeon-purple hover:underline disabled:opacity-50"
                  >
                    Proses
                  </button>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => handleUpdateStatus(p, "failed")}
                    className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Tandai Gagal
                  </button>
                </>
              )}

              {p.status === "processing" && (
                <>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => handleUpdateStatus(p, "completed")}
                    className="font-semibold text-jeon-purple hover:underline disabled:opacity-50"
                  >
                    Tandai Selesai
                  </button>
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => handleUpdateStatus(p, "failed")}
                    className="font-semibold text-red-600 hover:underline disabled:opacity-50"
                  >
                    Tandai Gagal
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        {payouts.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-surface/60 px-4 py-6 text-sm text-app-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            {filter === "needs_action" ? "Tidak ada penarikan yang perlu diproses." : "Belum ada riwayat penarikan."}
          </div>
        )}
      </div>

      {payouts.length > 0 && (
        <p className="mt-3 text-xs text-app-muted">
          Menampilkan {payouts.length} dari {total} penarikan.
        </p>
      )}
      {payouts.length < total && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-2 w-full rounded-lg border-2 border-jeon-ink py-2 text-sm font-semibold hover:border-jeon-purple disabled:opacity-50"
        >
          {loadingMore ? "Memuat..." : "Muat lebih"}
        </button>
      )}
    </div>
  );
}
