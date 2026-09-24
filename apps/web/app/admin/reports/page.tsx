"use client";

import { useEffect, useState } from "react";
import { AdminReport, ApiError, listAdminReports, resolveReport, restoreReport } from "@/lib/api-client";
import { confirmAction, confirmDelete } from "@/lib/confirm";
import { IconFlag } from "@/components/icons";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { useErrorToast } from "@/lib/use-error-toast";
import { useToast } from "@/components/Toast";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  takedown: "Ditindak (takedown)",
  dismissed: "Diabaikan",
  restored: "Dipulihkan",
  all: "Semua Riwayat",
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  // status -- audit fitur admin (5 September 2026): SEBELUMNYA halaman ini
  // HANYA pernah memanggil status="pending" -- laporan yang sudah diproses
  // hilang total dari tampilan, tidak ada cara meninjau riwayat sama sekali
  // walau backend sudah mendukung status apa pun.
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  // Bug UI/UX ditemukan 21 September 2026 (audit menyeluruh): nol toast
  // sukses di seluruh panel admin -- baris yang ditindak langsung lenyap
  // dari list tanpa penanda sukses, staf baru bisa mengira aksinya gagal.
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  function reload(offset = 0) {
    return listAdminReports({ status, limit: PAGE_SIZE, offset }).then((res) => {
      setTotal(res.total);
      if (offset === 0) setReports(res.items);
      else setReports((prev) => [...prev, ...res.items]);
    });
  }

  // handleStatusChange -- setLoading(true) dipanggil DI SINI (klik tombol
  // filter), bukan sinkron di badan useEffect -- react-hooks/set-state-in-
  // effect (ESLint) melarang setState sinkron langsung di efek, lihat pola
  // sama persis handleFilterChange di payouts/page.tsx & kyc/page.tsx.
  function handleStatusChange(value: string) {
    setStatus(value);
    setLoading(true);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat laporan."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleLoadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      await reload(reports.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat laporan lainnya.");
    } finally {
      setLoadingMore(false);
    }
  }

  // handleResolve -- audit fitur admin (5 September 2026): takedown
  // sebelumnya langsung eksekusi tanpa konfirmasi, padahal menonaktifkan
  // halaman/produk orang lain -- pola confirmDelete/confirmAction sudah
  // dipakai di seluruh dashboard utk aksi sepenting ini. "Abaikan" TIDAK
  // butuh konfirmasi (tidak mengubah apa pun milik pengguna).
  async function handleResolve(r: AdminReport, action: "takedown" | "dismiss") {
    if (action === "takedown") {
      const confirmed = await confirmDelete(
        `${r.target_type === "page" ? "Halaman" : "Produk"} yang dilaporkan akan langsung dinonaktifkan & pemiliknya diberi tahu. Lanjutkan?`,
        { title: "Takedown konten?", confirmButtonText: "Ya, Takedown" }
      );
      if (!confirmed) return;
    }

    setError(null);
    try {
      await resolveReport(r.id, action);
      await reload(0);
      showToast(action === "takedown" ? "Konten berhasil di-takedown." : "Laporan diabaikan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memproses laporan.");
    }
  }

  async function handleRestore(r: AdminReport) {
    const confirmed = await confirmAction(
      `${r.target_type === "page" ? "Halaman" : "Produk"} ini akan diaktifkan kembali & pemiliknya diberi tahu. Lanjutkan memulihkan?`,
      { title: "Pulihkan konten?", confirmButtonText: "Ya, Pulihkan" }
    );
    if (!confirmed) return;

    setError(null);
    try {
      await restoreReport(r.id);
      await reload(0);
      showToast("Konten berhasil dipulihkan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulihkan konten.");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Laporan Konten</h1>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => handleStatusChange(value)}
            className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${
              status === value ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-jeon-ink text-app-muted hover:border-jeon-purple"
            }`}
          >
            {label}
          </button>
        ))}
      </div>


      {loading ? (
        <p className="mt-4 text-sm text-app-muted">Memuat...</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-app-muted">
            Menampilkan {reports.length} dari {total} laporan.
          </p>

          <div className="mt-2 flex flex-col gap-2">
            {reports.map((r) => (
              <div key={r.id} className="rounded-xl border-2 border-jeon-ink bg-app-surface p-4 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-app-muted">
                    <IconFlag className="h-3.5 w-3.5 text-red-500" />
                    {r.target_type === "page" ? "Halaman" : "Produk"}
                  </div>
                  {r.status !== "pending" && (
                    <span className="rounded-full border-2 border-[#111111] bg-app-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-app-ink">
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  )}
                </div>
                {/* Konten yang dilaporkan -- bug UI/UX ditemukan 21
                    September 2026 (audit menyeluruh): sebelumnya cuma UUID
                    mentah tampil di sini, admin diminta Takedown tanpa cara
                    melihat konten yang dimaksud dari dalam panel. */}
                {/* flex-wrap + min-w-0/truncate -- perbaikan overflow 24
                    September 2026 (audit admin). Baris ini memaksa label
                    target, username, dan tautan "Lihat konten" berjejer di
                    satu baris tanpa boleh menyusut: di 390px scrollWidth
                    halaman jadi 567px, dan yang terdorong KELUAR LAYAR
                    justru tautan "Lihat konten" -- satu-satunya cara admin
                    memeriksa konten yang dilaporkan sebelum menekan
                    Takedown. Tombol Takedown merahnya sendiri tetap
                    terlihat & bisa diklik, jadi admin di ponsel praktis
                    diminta men-takedown sesuatu yang tidak bisa dia lihat.
                    Pola min-w-0 yang sama sudah diterapkan di
                    support-chat/page.tsx (21 Sept) tapi tidak pernah
                    dirambatkan ke sini. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                  {r.target_label ? (
                    <>
                      <span className="min-w-0 truncate font-semibold text-app-ink">{r.target_label}</span>
                      {r.target_username && <span className="min-w-0 truncate text-app-muted">@{r.target_username}</span>}
                      {r.target_url && (
                        <a href={r.target_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-jeon-purple hover:underline">
                          Lihat konten ↗
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="italic text-app-muted">(konten sudah dihapus)</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-app-ink">{r.reason}</p>
                {r.reporter_email && <p className="mt-1 text-xs text-app-muted">Pelapor: {r.reporter_email}</p>}
                {r.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleResolve(r, "takedown")}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Takedown
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResolve(r, "dismiss")}
                      className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-bold text-app-ink hover:border-jeon-purple"
                    >
                      Abaikan
                    </button>
                  </div>
                )}
                {r.status === "takedown" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => handleRestore(r)}
                      className="rounded-lg bg-jeon-purple px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      Pulihkan
                    </button>
                  </div>
                )}
              </div>
            ))}
            {reports.length === 0 && <AdminEmptyState text="Tidak ada laporan." />}
          </div>

          {reports.length < total && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-3 w-full rounded-lg border-2 border-jeon-ink py-2 text-sm font-semibold hover:border-jeon-purple disabled:opacity-50"
            >
              {loadingMore ? "Memuat..." : "Muat lebih"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
