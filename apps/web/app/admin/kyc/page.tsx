"use client";

import { useEffect, useState } from "react";
import {
  AdminKycDetail,
  AdminKycItem,
  ApiError,
  getAdminKycDetail,
  listAdminKyc,
  reviewKyc,
} from "@/lib/api-client";
import { IconInbox, IconShield } from "@/components/icons";

const STATUS_LABEL: Record<AdminKycItem["status"], string> = {
  unverified: "Belum diajukan",
  pending: "Menunggu review",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

const STATUS_BADGE: Record<AdminKycItem["status"], string> = {
  unverified: "bg-gray-100 text-muted",
  pending: "bg-accent-subtle text-accent-dark",
  verified: "bg-secondary-subtle text-secondary-dark",
  rejected: "bg-red-50 text-red-600",
};

export default function AdminKycPage() {
  const [items, setItems] = useState<AdminKycItem[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<AdminKycDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  function reload(f: "pending" | "all") {
    return listAdminKyc(f).then(setItems);
  }

  function handleFilterChange(f: "pending" | "all") {
    setFilter(f);
    setLoading(true);
  }

  useEffect(() => {
    reload(filter)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengajuan KYC."))
      .finally(() => setLoading(false));
  }, [filter]);

  async function openDetail(userId: string) {
    setError(null);
    setDetail(null);
    setRejectReason("");
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

  async function handleReview(status: "verified" | "rejected") {
    if (!detail) return;
    if (status === "rejected" && !rejectReason.trim()) {
      setError("Alasan penolakan wajib diisi.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await reviewKyc(detail.user_id, { status, rejection_reason: rejectReason.trim() || undefined });
      setDetail(null);
      await reload(filter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status KYC.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Review KYC</h1>
      <p className="mt-1 text-sm text-muted">
        Verifikasi identitas & rekening kreator. Tidak memblokir penjualan/penarikan -- hanya
        memprioritaskan antrian proses penarikan dana.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => handleFilterChange("pending")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "pending"
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border text-muted hover:border-primary/50"
          }`}
        >
          Menunggu Review
        </button>
        <button
          type="button"
          onClick={() => handleFilterChange("all")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            filter === "all"
              ? "border-primary bg-primary-subtle text-primary"
              : "border-border text-muted hover:border-primary/50"
          }`}
        >
          Semua Riwayat
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {items.map((it) => (
          <button
            key={it.user_id}
            type="button"
            onClick={() => openDetail(it.user_id)}
            className="flex items-center justify-between rounded-xl border border-border bg-white p-4 text-left shadow-card hover:border-primary/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <IconShield className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {it.full_name_ktp || "(nama belum diisi)"}
                  <span className="ml-2 font-normal text-muted">
                    @{it.username} ({it.email})
                  </span>
                </p>
                {it.submitted_at && (
                  <p className="text-xs text-muted">Diajukan {new Date(it.submitted_at).toLocaleString("id-ID")}</p>
                )}
              </div>
            </div>
            <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[it.status]}`}>
              {STATUS_LABEL[it.status]}
            </span>
          </button>
        ))}

        {items.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-sm text-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            {filter === "pending" ? "Tidak ada pengajuan yang menunggu review." : "Belum ada riwayat pengajuan KYC."}
          </div>
        )}
      </div>

      {(detailLoading || detail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-hero">
            {detailLoading && <p className="text-sm text-muted">Memuat detail...</p>}
            {detail && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-lg font-bold text-ink">@{detail.username}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                </div>

                <dl className="mt-4 flex flex-col gap-2 text-sm">
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">Nama KTP</dt>
                    <dd className="text-ink">{detail.full_name_ktp}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">Nama Rekening</dt>
                    <dd className="text-ink">{detail.bank_account_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">Alamat Domisili</dt>
                    <dd className="text-ink">{detail.domicile_address}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">Penjelasan Bisnis</dt>
                    <dd className="text-ink">{detail.business_description}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-bold uppercase text-muted">Kanal Promosi</dt>
                    <dd className="text-ink">{detail.promotion_channels}</dd>
                  </div>
                </dl>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {detail.ktp_photo_url && (
                    <a href={detail.ktp_photo_url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={detail.ktp_photo_url} alt="Foto KTP" className="aspect-square rounded-lg border border-border object-cover" />
                      <p className="mt-1 text-center text-[10px] font-semibold text-muted">KTP</p>
                    </a>
                  )}
                  {detail.selfie_photo_url && (
                    <a href={detail.selfie_photo_url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={detail.selfie_photo_url} alt="Foto selfie" className="aspect-square rounded-lg border border-border object-cover" />
                      <p className="mt-1 text-center text-[10px] font-semibold text-muted">Selfie</p>
                    </a>
                  )}
                  {detail.bank_proof_url && (
                    <a
                      href={detail.bank_proof_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-square items-center justify-center rounded-lg border border-border bg-primary-subtle/40 text-xs font-semibold text-primary"
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
                      className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="mt-4 w-full rounded-lg border border-border py-2 text-xs font-semibold text-muted hover:border-primary hover:text-primary"
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
