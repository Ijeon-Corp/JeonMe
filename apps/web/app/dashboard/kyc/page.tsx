"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, KycStatus, getKycStatus, submitKyc } from "@/lib/api-client";
import { IconCheck, IconShield, IconUpload } from "@/components/icons";

const STATUS_LABEL: Record<KycStatus["status"], string> = {
  unverified: "Belum diajukan",
  pending: "Menunggu review",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

const STATUS_BADGE_CLASS: Record<KycStatus["status"], string> = {
  unverified: "bg-gray-100 text-muted",
  pending: "bg-amber-50 text-amber-700",
  verified: "bg-secondary-subtle text-secondary-dark",
  rejected: "bg-red-50 text-red-600",
};

export default function DashboardKycPage() {
  const [status, setStatus] = useState<KycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [fullNameKtp, setFullNameKtp] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [domicileAddress, setDomicileAddress] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [promotionChannels, setPromotionChannels] = useState("");

  const ktpInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const bankProofInputRef = useRef<HTMLInputElement>(null);

  function reload() {
    return getKycStatus().then((s) => {
      setStatus(s);
      setFullNameKtp(s.full_name_ktp);
      setBankAccountName(s.bank_account_name);
      setDomicileAddress(s.domicile_address);
      setBusinessDescription(s.business_description);
      setPromotionChannels(s.promotion_channels);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat status KYC."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ktpPhoto = ktpInputRef.current?.files?.[0];
    const selfiePhoto = selfieInputRef.current?.files?.[0];
    const bankProof = bankProofInputRef.current?.files?.[0];

    if (!fullNameKtp.trim() || !bankAccountName.trim() || !domicileAddress.trim() || !businessDescription.trim() || !promotionChannels.trim()) {
      setError("Semua kolom teks wajib diisi.");
      return;
    }
    if (!ktpPhoto || !selfiePhoto || !bankProof) {
      setError("Foto KTP, foto selfie, dan bukti rekening wajib diunggah.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await submitKyc({
        full_name_ktp: fullNameKtp.trim(),
        bank_account_name: bankAccountName.trim(),
        domicile_address: domicileAddress.trim(),
        business_description: businessDescription.trim(),
        promotion_channels: promotionChannels.trim(),
        ktp_photo: ktpPhoto,
        selfie_photo: selfiePhoto,
        bank_proof: bankProof,
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim pengajuan KYC.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  const canSubmit = status?.status === "unverified" || status?.status === "rejected";

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Verifikasi Rekening (KYC)</h1>
      <p className="mt-1 text-sm text-muted">
        Lengkapi verifikasi identitas & rekening supaya penarikan danamu diprioritaskan diproses tim Jeonme. Akun
        yang belum terverifikasi tetap bisa berjualan dan menarik dana -- hanya diproses belakangan.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {status && (
        <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
          <div className="flex items-center gap-2">
            <IconShield className="h-4 w-4 text-primary" />
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE_CLASS[status.status]}`}>
              {STATUS_LABEL[status.status]}
            </span>
          </div>

          {status.status === "rejected" && status.rejection_reason && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              Alasan penolakan: {status.rejection_reason}
            </p>
          )}

          {status.status === "pending" && (
            <p className="mt-3 text-xs text-muted">
              Pengajuanmu sedang direview, SLA 3x24 jam hari kerja. Kamu akan bisa mengajukan ulang kalau ditolak.
            </p>
          )}

          {status.status === "verified" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-secondary-dark">
              <IconCheck className="h-3.5 w-3.5" />
              Akunmu sudah terverifikasi.
            </p>
          )}
        </section>
      )}

      {canSubmit && (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-card">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Syarat: halaman sudah punya minimal 1 produk aktif
          </p>

          <label className="text-xs font-semibold text-ink">
            Nama lengkap (sesuai KTP)
            <input
              type="text"
              value={fullNameKtp}
              onChange={(e) => setFullNameKtp(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Nama pemilik rekening bank (harus sama dengan nama KTP)
            <input
              type="text"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Alamat domisili lengkap
            <textarea
              value={domicileAddress}
              onChange={(e) => setDomicileAddress(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Penjelasan bisnis/produk yang dijual
            <textarea
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Kanal promosi (mis. Instagram, TikTok, WhatsApp)
            <input
              type="text"
              value={promotionChannels}
              onChange={(e) => setPromotionChannels(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label className="text-xs font-semibold text-ink">
            Foto KTP
            <input ref={ktpInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="mt-1 w-full text-xs" />
          </label>

          <label className="text-xs font-semibold text-ink">
            Foto selfie sambil memegang KTP
            <input ref={selfieInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="mt-1 w-full text-xs" />
          </label>

          <label className="text-xs font-semibold text-ink">
            Bukti rekening (buku tabungan/e-statement)
            <input ref={bankProofInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="mt-1 w-full text-xs" />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-2 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            <IconUpload className="h-4 w-4" />
            {submitting ? "Mengirim..." : "Ajukan Verifikasi"}
          </button>
        </form>
      )}
    </div>
  );
}
