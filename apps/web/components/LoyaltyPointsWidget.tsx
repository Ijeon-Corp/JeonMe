"use client";

import { useState } from "react";
import { ApiError, PublicLoyaltyReward, getMyLoyaltyPoints, redeemLoyaltyReward } from "@/lib/api-client";

// No.94 (Sprint 13): pengunjung cek poin + tukar reward pakai email SAJA
// (tanpa akun, sama seperti checkout) -- poin dihitung PER KREATOR halaman
// ini, bukan lintas platform Jeonme.
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
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [rewards, setRewards] = useState<PublicLoyaltyReward[] | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemResult, setRedeemResult] = useState<{ rewardName: string; voucherCode: string } | null>(null);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setRedeemResult(null);
    setChecking(true);
    try {
      const res = await getMyLoyaltyPoints(username, email.trim());
      setPoints(res.total_points);
      setRewards(res.rewards);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat poin, coba lagi.");
    } finally {
      setChecking(false);
    }
  }

  async function handleRedeem(reward: PublicLoyaltyReward) {
    setError(null);
    setRedeemingId(reward.id);
    try {
      const res = await redeemLoyaltyReward(reward.id, email.trim());
      setRedeemResult({ rewardName: res.reward_name, voucherCode: res.voucher_code });
      const refreshed = await getMyLoyaltyPoints(username, email.trim());
      setPoints(refreshed.total_points);
      setRewards(refreshed.rewards);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menukar reward, coba lagi.");
    } finally {
      setRedeemingId(null);
    }
  }

  return (
    <div className={cardClassName}>
      <p className={`text-sm font-semibold ${titleClassName}`}>Poin Loyalitas</p>

      {points === null ? (
        <form onSubmit={handleCheck} className="mt-2 flex gap-1.5">
          <input
            type="email"
            required
            placeholder="Email kamu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-white/30 bg-white/90 px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={checking}
            className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs transition-all duration-200 disabled:opacity-60 ${buttonClassName}`}
          >
            {checking ? "..." : "Cek Poin"}
          </button>
        </form>
      ) : (
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
                className="flex items-center justify-between rounded-md border border-white/30 bg-white/90 px-2 py-1.5 text-xs text-ink"
              >
                <span>
                  {reward.name} <span className="opacity-70">({reward.points_needed} poin)</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRedeem(reward)}
                  disabled={redeemingId === reward.id || points < reward.points_needed}
                  className="flex-shrink-0 rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-white disabled:opacity-40"
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
