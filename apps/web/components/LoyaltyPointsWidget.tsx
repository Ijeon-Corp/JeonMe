"use client";

import { useState } from "react";
import {
  ApiError,
  PublicLoyaltyReward,
  getMyLoyaltyPoints,
  redeemLoyaltyReward,
  requestLoyaltyVerificationCode,
  verifyLoyaltyCode,
} from "@/lib/api-client";

// No.94 (Sprint 13): pengunjung cek poin + tukar reward pakai email SAJA
// (tanpa akun, sama seperti checkout) -- poin dihitung PER KREATOR halaman
// ini, bukan lintas platform Jeonme.
//
// Audit OWASP A04 (4 September 2026): SEBELUMNYA mengetik email saja
// langsung menunjukkan poin & mengizinkan penukaran -- siapa pun yang tahu
// email pembeli sungguhan (bocor lewat data breach, kelihatan di ulasan
// publik, dst) bisa melihat & MENGHABISKAN poin orang lain. Alur sekarang
// 3 langkah: (1) masukkan email -> kode 6-digit dikirim, (2) masukkan kode
// -> dapat verification_token, (3) verification_token dipakai ulang untuk
// lihat poin & tukar reward selama sesi ini (30 menit) -- cukup masukkan
// kode SEKALI per kunjungan, bukan tiap aksi.
type Step = "email" | "code" | "verified";

export default function LoyaltyPointsWidget({
  username,
  cardClassName,
  titleClassName,
  buttonClassName,
}: {
  username: string;
  cardClassName: string;
  titleClassName: string;
  buttonClassName: string;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [rewards, setRewards] = useState<PublicLoyaltyReward[] | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemResult, setRedeemResult] = useState<{ rewardName: string; voucherCode: string } | null>(null);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestLoyaltyVerificationCode(username, email.trim());
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim kode, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function loadPoints(token: string) {
    const res = await getMyLoyaltyPoints(username, email.trim(), token);
    setPoints(res.total_points);
    setRewards(res.rewards);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await verifyLoyaltyCode(username, email.trim(), code.trim());
      setVerificationToken(res.verification_token);
      await loadPoints(res.verification_token);
      setStep("verified");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kode salah atau kedaluwarsa, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRedeem(reward: PublicLoyaltyReward) {
    setError(null);
    setRedeemingId(reward.id);
    try {
      const res = await redeemLoyaltyReward(reward.id, email.trim(), verificationToken);
      setRedeemResult({ rewardName: res.reward_name, voucherCode: res.voucher_code });
      await loadPoints(verificationToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menukar reward, coba lagi.");
    } finally {
      setRedeemingId(null);
    }
  }

  return (
    <div className={cardClassName}>
      <p className={`text-sm font-semibold ${titleClassName}`}>Poin Loyalitas</p>

      {step === "email" && (
        <form onSubmit={handleRequestCode} className="mt-2 flex gap-1.5">
          <input
            type="email"
            required
            placeholder="Email kamu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
          >
            {submitting ? "..." : "Kirim Kode"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleVerifyCode} className="mt-2 flex flex-col gap-1.5">
          <p className={`text-[11px] ${titleClassName} opacity-80`}>Kode 6-digit sudah dikirim ke {email}</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              required
              inputMode="numeric"
              maxLength={6}
              placeholder="Kode 6-digit"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs tracking-widest text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
            >
              {submitting ? "..." : "Verifikasi"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
            className={`self-start text-[10px] underline ${titleClassName} opacity-70`}
          >
            Ganti email
          </button>
        </form>
      )}

      {step === "verified" && (
        <>
          <p className={`mt-1 text-xs ${titleClassName}`}>
            Poin kamu: <b>{points}</b>
          </p>
          {redeemResult && (
            <p className="mt-2 rounded-md bg-green-50 px-2 py-1.5 text-[11px] font-semibold text-green-700">
              Berhasil menukar &quot;{redeemResult.rewardName}&quot;! Kode voucher: {redeemResult.voucherCode}
            </p>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            {rewards?.map((reward) => (
              <div
                key={reward.id}
                className="flex items-center justify-between rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-app-ink"
              >
                <span>
                  {reward.name} <span className="opacity-70">({reward.points_needed} poin)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRedeem(reward)}
                  disabled={redeemingId === reward.id || (points ?? 0) < reward.points_needed}
                  className="flex-shrink-0 rounded bg-jeon-purple px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-40"
                >
                  {redeemingId === reward.id ? "..." : "Tukar"}
                </button>
              </div>
            ))}
            {rewards?.length === 0 && <p className="text-[11px] opacity-70">Belum ada reward tersedia.</p>}
          </div>
        </>
      )}

      {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
