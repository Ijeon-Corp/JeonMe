"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  LoyaltyReward,
  LoyaltySettings,
  createLoyaltyReward,
  deleteLoyaltyReward,
  getLoyaltySettings,
  listLoyaltyRewards,
  updateLoyaltyReward,
  upsertLoyaltySettings,
} from "@/lib/api-client";
import { IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";

export default function DashboardLoyaltyPage() {
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rewardName, setRewardName] = useState("");
  const [pointsNeeded, setPointsNeeded] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "nominal">("nominal");
  const [discountValue, setDiscountValue] = useState("");

  function reload() {
    return Promise.all([getLoyaltySettings(), listLoyaltyRewards()]).then(([s, r]) => {
      setSettings(s);
      setRewards(r);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat program loyalitas."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveSettings() {
    if (!settings) return;
    setError(null);
    setSavingSettings(true);
    try {
      await upsertLoyaltySettings({
        is_active: settings.is_active,
        point_type: settings.point_type,
        points_rate: settings.points_rate,
        points_limit: settings.points_limit ?? undefined,
        clear_limit: settings.points_limit === null,
        min_purchase_idr: settings.min_purchase_idr,
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleCreateReward(e: React.FormEvent) {
    e.preventDefault();
    const points = Number(pointsNeeded);
    const value = Number(discountValue);
    if (!rewardName.trim() || !points || points < 1 || !value || value < 1) {
      setError("Isi nama reward, poin yang dibutuhkan, dan nilai diskon dengan benar.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createLoyaltyReward({ name: rewardName, points_needed: points, discount_type: discountType, discount_value: value });
      await reload();
      setRewardName("");
      setPointsNeeded("");
      setDiscountValue("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat reward.");
    } finally {
      setCreating(false);
    }
  }

  async function handleTogglePublish(reward: LoyaltyReward) {
    const next = !reward.is_published;
    setRewards((prev) => prev.map((r) => (r.id === reward.id ? { ...r, is_published: next } : r)));
    try {
      await updateLoyaltyReward(reward.id, { is_published: next });
    } catch (err) {
      setRewards((prev) => prev.map((r) => (r.id === reward.id ? { ...r, is_published: reward.is_published } : r)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui reward.");
    }
  }

  async function handleDeleteReward(reward: LoyaltyReward) {
    if (!(await confirmDelete(`Hapus reward "${reward.name}"?`))) return;
    const previous = rewards;
    setRewards((prev) => prev.filter((r) => r.id !== reward.id));
    try {
      await deleteLoyaltyReward(reward.id);
    } catch (err) {
      setRewards(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus reward.");
    }
  }

  if (loading || !settings) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-1 text-sm text-muted">
        Beri poin ke pembeli setiap transaksi, biarkan mereka menukarnya dengan reward -- mekanisme retensi
        pembeli berulang, cocok disandingkan dengan voucher.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="glass mt-6 rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-2">
          <Toggle
            checked={settings.is_active}
            onChange={() => setSettings({ ...settings, is_active: !settings.is_active })}
            label="Aktifkan program loyalitas"
          />
          <span className="text-sm font-semibold text-ink">Aktifkan Program Loyalitas</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Tipe Poin</label>
            <select
              value={settings.point_type}
              onChange={(e) => setSettings({ ...settings, point_type: e.target.value as "percentage" | "nominal" })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="nominal">Nominal (poin per Rp10.000)</option>
              <option value="percentage">Persentase (poin per Rp100.000)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Rate Poin</label>
            <input
              type="number"
              min={0}
              step="0.1"
              value={settings.points_rate}
              onChange={(e) => setSettings({ ...settings, points_rate: Number(e.target.value) })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Batas Maks Poin per Transaksi (opsional)</label>
            <input
              type="number"
              min={1}
              value={settings.points_limit ?? ""}
              onChange={(e) => setSettings({ ...settings, points_limit: e.target.value ? Number(e.target.value) : null })}
              placeholder="Tanpa batas"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Minimum Pembelian (Rp)</label>
            <input
              type="number"
              min={0}
              value={settings.min_purchase_idr}
              onChange={(e) => setSettings({ ...settings, min_purchase_idr: Number(e.target.value) })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={savingSettings}
          className="btn-primary mt-4 rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {savingSettings ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </section>

      <section className="glass mt-6 rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold text-ink">Katalog Reward</h2>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
            >
              <IconPlus className="h-4 w-4" />
              Tambah Reward
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={handleCreateReward} className="mt-3 flex flex-col gap-3 rounded-lg border border-border p-3">
            <input
              type="text"
              required
              placeholder="Nama reward (mis. Diskon 20%)"
              value={rewardName}
              onChange={(e) => setRewardName(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                required
                min={1}
                placeholder="Poin dibutuhkan"
                value={pointsNeeded}
                onChange={(e) => setPointsNeeded(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percentage" | "nominal")}
                className="rounded-lg border border-border px-2 py-2 text-sm focus:border-primary focus:outline-none"
              >
                <option value="nominal">Rp (nominal)</option>
                <option value="percentage">% (persen)</option>
              </select>
              <input
                type="number"
                required
                min={1}
                placeholder="Nilai diskon"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Reward"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {rewards.map((reward) => (
            <div key={reward.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">{reward.name}</p>
                <p className="text-xs text-muted">
                  {reward.points_needed} poin &middot;{" "}
                  {reward.discount_type === "percentage" ? `${reward.discount_value}%` : `Rp${reward.discount_value.toLocaleString("id-ID")}`}{" "}
                  &middot; {reward.redeemed_count}x ditukar
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Toggle checked={reward.is_published} onChange={() => handleTogglePublish(reward)} label={`Publikasikan ${reward.name}`} />
                <button
                  type="button"
                  onClick={() => handleDeleteReward(reward)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {rewards.length === 0 && <EmptyState text="Belum ada reward -- tambahkan di atas." />}
        </div>
      </section>
    </div>
  );
}
