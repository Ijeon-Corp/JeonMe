"use client";

import { useEffect, useState } from "react";
import {
  AdminKycDetail,
  AdminKycItem,
  ApiError,
  getAdminKycDetail,
  listAdminKyc,
  revokeKyc,
  reviewKyc,
} from "@/lib/api-client";
import { confirmAction, confirmDelete } from "@/lib/confirm";
import { IconInbox, IconShield } from "@/components/icons";
import { useErrorToast } from "@/lib/use-error-toast";

const STATUS_LABEL: Record<AdminKycItem["status"], string> = {
  unverified: "Belum diajukan",
  pending: "Menunggu review",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

const STATUS_BADGE: Record<AdminKycItem["status"], string> = {
  unverified: "bg-gray-100 text-app-muted",
  pending: "bg-jeon-warning/15 text-jeon-warning",
  verified: "bg-jeon-purple/10 text-jeon-purple",
  rejected: "bg-red-50 text-red-600",
};

const PAGE_SIZE = 50;

export default function AdminKycPage() {
  const [items, setItems] = useState<AdminKycItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);

  const [detail, setDetail] = useState<AdminKycDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [busy, setBusy] = useState(false);

  function reload(f: "pending" | "all", offset = 0) {
    return listAdminKyc({ status: f, search, limit: PAGE_SIZE, offset }).then((res) => {
      setTotal(res.total);
      if (offset === 0) setItems(res.items);
      else setItems((prev) => [...prev, ...res.items]);
    });
  }

  function handleFilterChange(f: "pending" | "all") {
    setFilter(f);
    setLoading(true);
  }

  useEffect(() => {
    reload(filter)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengajuan KYC."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await reload(filter, 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencari pengajuan KYC.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      await reload(filter, items.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat pengajuan lainnya.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openDetail(userId: string) {
    setError(null);
    setDetail(null);
    setRejectReason("");
    setRevokeReason("");
    setDetailLoading(true);
    try {
      const d = await getAdminKycDetail(userId);
      setDetail(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat detail KYC.");
    } finally {
      setDetailLoading(false);
    }
  }

  // handleReview -- audit fitur admin (5 September 2026): Setujui/Tolak
  // sebelumnya langsung eksekusi tanpa jeda konfirmasi.
  async function handleReview(status: "verified" | "rejected") {
    if (!detail) return;
    if (status === "rejected" && !rejectReason.trim()) {
      setError("Alasan penolakan wajib diisi.");
      return;
    }
    const confirmed =
      status === "verified"
        ? await confirmAction(`Setujui verifikasi KYC @${detail.username}? Penarikan saldonya akan diprioritaskan.`, {
            title: "Setujui KYC?",
            confirmButtonText: "Ya, Setujui",
          })
        : await confirmDelete(`Tolak pengajuan KYC @${detail.username}? Kreator akan diberi tahu & bisa mengajukan ulang.`, {
            title: "Tolak KYC?",
            confirmButtonText: "Ya, Tolak",
          });
    if (!confirmed) return;

    setError(null);
    setBusy(true);
    try {
      await reviewKyc(detail.user_id, { status, rejection_reason: rejectReason.trim() || undefined });
      setDetail(null);
      await reload(filter, 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status KYC.");
    } finally {
      setBusy(false);
    }
  }

  // handleRevoke -- audit fitur admin (5 September 2026): SEBELUMNYA
  // "verified" tidak punya jalur balik sama sekali dari panel admin.
  async function handleRevoke() {
    if (!detail) return;
    if (!revokeReason.trim()) {
      setError("Alasan pencabutan wajib diisi.");
      return;
    }
    const confirmed = await confirmDelete(
      `Cabut verifikasi KYC @${detail.username}? Statusnya akan berubah jadi ditolak & kreator diberi tahu.`,
      { title: "Cabut verifikasi KYC?", confirmButtonText: "Ya, Cabut" }
    );
    if (!confirmed) return;

    setError(null);
    setBusy(true);
    try {
      await revokeKyc(detail.user_id, revokeReason.trim());
      setDetail(null);
      await reload(filter, 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencabut verifikasi KYC.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Review KYC</h1>
      <p className="mt-1 text-sm text-app-muted">
        Verifikasi identitas & rekening kreator. Tidak memblokir penjualan/penarikan -- hanya
        memprioritaskan antrian proses penarikan dana.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleFilterChange("pending")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "pending"
              ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
              : "border-app-border text-app-muted hover:border-jeon-purple/50"
          }`}
        >
          Menunggu Review
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
        <form onSubmit={handleSearch} className="ml-auto flex gap-1.5">
          <input
            type="text"
            placeholder="Cari username/email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-lg border border-app-border px-3 py-1.5 text-xs focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <button type="submit" className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold hover:border-jeon-purple">
            Cari
          </button>
        </form>
      </div>


      {loading ? (
        <p className="mt-4 text-sm text-app-muted">Memuat...</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {items.map((it) => (
              <button
                key={it.user_id}
                type="button"
                onClick={() => openDetail(it.user_id)}
                className="flex items-center justify-between rounded-xl border-2 border-jeon-ink bg-app-surface p-4 text-left shadow-card hover:border-jeon-purple/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                    <IconShield className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-app-ink">
                      {it.full_name_ktp || "(nama belum diisi)"}
                      <span className="ml-2 font-normal text-app-muted">
                        @{it.username} ({it.email})
                      </span>
                    </p>
                    {it.submitted_at && (
                      <p className="text-xs text-app-muted">Diajukan {new Date(it.submitted_at).toLocaleString("id-ID")}</p>
                    )}
                  </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[it.status]}`}>
                  {STATUS_LABEL[it.status]}
                </span>
              </button>
            ))}

            {items.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-surface/60 px-4 py-6 text-sm text-app-muted">
                <IconInbox className="h-4 w-4 flex-shrink-0" />
                {filter === "pending" ? "Tidak ada pengajuan yang menunggu review." : "Belum ada riwayat pengajuan KYC."}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <p className="mt-3 text-xs text-app-muted">
              Menampilkan {items.length} dari {total} pengajuan.
            </p>
          )}
          {items.length < total && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="mt-2 w-full rounded-lg border-2 border-jeon-ink py-2 text-sm font-semibold hover:border-jeon-purple disabled:opacity-50"
            >
              {loadingMore ? "Memuat..." : "Muat lebih"}
            </button>
          )}
        </>
      )}

      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-jlg border-2 border-jeon-ink bg-app-surface p-6 shadow-brutal">
            {detailLoading && <p className="text-sm text-app-muted">Memuat detail...</p>}
            {detail && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-app-ink">@{detail.username}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>

                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase text-app-muted">Nama KTP</dt>
                    <dd className="text-app-ink">{detail.full_name_ktp}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-app-muted">Nama Rekening</dt>
                    <dd className="text-app-ink">{detail.bank_account_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-app-muted">Alamat Domisili</dt>
                    <dd className="text-app-ink">{detail.domicile_address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-app-muted">Penjelasan Bisnis</dt>
                    <dd className="text-app-ink">{detail.business_description}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-app-muted">Kanal Promosi</dt>
                    <dd className="text-app-ink">{detail.promotion_channels}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {/* SENGAJA TETAP <img> mentah (audit performa 15 September
                      2026, migrasi next/image) -- dua alasan, keduanya cukup
                      sendiri:
                      1. PRIVASI: ini foto KTP & selfie pemohon. Melewatkannya
                         lewat /_next/image berarti Next.js MENYALIN dokumen
                         identitas itu ke cache gambar di disk server
                         (.next/cache/images), di luar object storage yang
                         aksesnya sudah dijaga presigned URL.
                      2. SIA-SIA: URL-nya presigned & hanya berlaku 15 menit
                         (kyc.go PresignedDownloadURL), di-generate ULANG setiap
                         admin membuka halaman ini -- tanda tangannya selalu beda,
                         jadi cache optimizer tidak akan pernah kena sama sekali.
                      Halaman ini juga admin-only & jarang dibuka, jadi tidak ada
                      keuntungan trafik yang hilang. */}
                  {detail.ktp_photo_url && (
                    <a href={detail.ktp_photo_url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={detail.ktp_photo_url} alt="Foto KTP" className="aspect-square rounded-lg border border-app-border object-cover" />
                      <p className="mt-1 text-center text-[10px] font-semibold text-app-muted">KTP</p>
                    </a>
                  )}
                  {detail.selfie_photo_url && (
                    <a href={detail.selfie_photo_url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan privasi/presigned di blok KTP di atas */}
                      <img src={detail.selfie_photo_url} alt="Foto selfie" className="aspect-square rounded-lg border border-app-border object-cover" />
                      <p className="mt-1 text-center text-[10px] font-semibold text-app-muted">Selfie</p>
                    </a>
                  )}
                  {detail.bank_proof_url && (
                    <a
                      href={detail.bank_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-square items-center justify-center rounded-lg border border-app-border bg-jeon-purple/5 text-xs font-semibold text-jeon-purple"
                    >
                      Lihat Bukti
                    </a>
                  )}
                </div>

                {detail.status === "pending" && (
                  <div className="mt-4 flex flex-col gap-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Alasan penolakan (wajib kalau menolak)"
                      rows={2}
                      className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReview("verified")}
                        className="btn-primary flex-1 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
                      >
                        Setujui
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleReview("rejected")}
                        className="flex-1 rounded-lg border border-red-300 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                )}

                {detail.status === "rejected" && detail.rejection_reason && (
                  <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                    Alasan penolakan: {detail.rejection_reason}
                  </p>
                )}

                {/* Cabut verifikasi -- audit fitur admin (5 September 2026):
                    SEBELUMNYA "verified" tidak punya jalur balik sama
                    sekali dari sini, cuma bisa lewat UPDATE manual di
                    database. */}
                {detail.status === "verified" && (
                  <div className="mt-4 flex flex-col gap-2 border-t border-app-border pt-4">
                    <p className="text-xs font-bold uppercase text-app-muted">Cabut Verifikasi</p>
                    <textarea
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      placeholder="Alasan pencabutan (wajib)"
                      rows={2}
                      className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleRevoke}
                      className="rounded-lg border border-red-300 py-2.5 text-sm font-bold text-red-600 disabled:opacity-60"
                    >
                      Cabut Verifikasi
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="mt-4 w-full rounded-lg border-2 border-jeon-ink py-2 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
