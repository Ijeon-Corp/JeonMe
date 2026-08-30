"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import {
  ApiError,
  DonationSettings,
  WishlistItem,
  createWishlistItem,
  deleteWishlistItem,
  getDonationSettings,
  listWishlistItems,
  upsertDonationSettings,
} from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import { IconGift, IconTrash } from "@/components/icons";

function formatRupiah(n: number): string {
  return "Rp" + n.toLocaleString("id-ID");
}

export default function DashboardDonationPage() {
  const { t } = useLocale();
  const [settings, setSettings] = useState<DonationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [minAmountIDR, setMinAmountIDR] = useState("");

  // Goal/target donasi (Gap #4 benchmark kompetitif, 9 Agustus 2026, ala
  // Saweria/Trakteer) -- goalAmountIDR="" berarti tidak ada target.
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmountIDR, setGoalAmountIDR] = useState("");

  // Wishlist -- daftar terpisah dari form pengaturan utama supaya
  // tambah/hapus item tidak perlu submit ulang form Simpan di atas.
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistError, setWishlistError] = useState<string | null>(null);
  const [addingWishlist, setAddingWishlist] = useState(false);
  const [wishlistName, setWishlistName] = useState("");
  const [wishlistPrice, setWishlistPrice] = useState("");
  const [wishlistLink, setWishlistLink] = useState("");

  useEffect(() => {
    Promise.all([getDonationSettings(), listWishlistItems()])
      .then(([s, w]) => {
        setSettings(s);
        setEnabled(s.enabled);
        setTitle(s.title || "Traktir aku kopi");
        setMinAmountIDR(s.min_amount_idr ? String(s.min_amount_idr) : "10000");
        setGoalTitle(s.goal_title);
        setGoalAmountIDR(s.goal_amount_idr ? String(s.goal_amount_idr) : "");
        setWishlist(w);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.donation.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const minAmount = Number(minAmountIDR);
    if (enabled && (!title.trim() || !minAmount || minAmount < 1000)) {
      setError(t("dashboard.pages.donation.errors.titleAndMinAmountRequired"));
      return;
    }
    const goalAmount = goalAmountIDR ? Number(goalAmountIDR) : 0;
    if (goalAmount > 0 && !goalTitle.trim()) {
      setError(t("dashboard.pages.donation.errors.goalTitleRequired"));
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertDonationSettings({
        enabled,
        title: title.trim(),
        min_amount_idr: minAmount,
        goal_title: goalTitle.trim(),
        goal_amount_idr: goalAmount,
      });
      const refreshed = await getDonationSettings();
      setSettings(refreshed);
      setGoalTitle(refreshed.goal_title);
      setGoalAmountIDR(refreshed.goal_amount_idr ? String(refreshed.goal_amount_idr) : "");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.donation.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddWishlist(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(wishlistPrice);
    if (!wishlistName.trim() || !price || price < 1000) {
      setWishlistError(t("dashboard.pages.donation.errors.wishlistNameAndPriceRequired"));
      return;
    }
    setWishlistError(null);
    try {
      await createWishlistItem({ name: wishlistName.trim(), price_idr: price, link: wishlistLink.trim() });
      setWishlistName("");
      setWishlistPrice("");
      setWishlistLink("");
      setAddingWishlist(false);
      setWishlist(await listWishlistItems());
    } catch (err) {
      setWishlistError(err instanceof ApiError ? err.message : t("dashboard.pages.donation.errors.addWishlistFailed"));
    }
  }

  async function handleDeleteWishlist(id: string) {
    await deleteWishlistItem(id);
    setWishlist((prev) => prev.filter((w) => w.id !== id));
  }

  if (loading) return <PageSkeleton />;

  const goalAmountNum = Number(goalAmountIDR) || 0;
  const goalProgressPct = goalAmountNum > 0 ? Math.min(100, ((settings?.goal_raised_idr ?? 0) / goalAmountNum) * 100) : 0;

  return (
    <div className="mx-auto max-w-lg">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.donation.subtitle")}</p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.donation.saved")}</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.donation.enableBlock")}</p>
            <p className="text-xs text-app-muted">{t("dashboard.pages.donation.enableBlockHint")}</p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label={t("dashboard.pages.donation.enableBlockAria")} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.donation.titleLabel")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("dashboard.pages.donation.titlePlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.donation.minAmountLabel")}</label>
          <input
            type="number"
            min={1000}
            value={minAmountIDR}
            onChange={(e) => setMinAmountIDR(e.target.value)}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <p className="mt-1 text-[11px] text-app-muted">{t("dashboard.pages.donation.minAmountHint")}</p>
        </div>

        {/* Target Donasi -- Gap #4 benchmark kompetitif (9 Agustus 2026, ala
            goal Saweria/Trakteer): progress bar publik, direset ke nol
            setiap kali target diganti (lihat catatan donation_goal_started_at
            di backend) -- BUKAN akumulasi sepanjang masa. */}
        <div className="rounded-jmd border border-dashed border-app-border p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.donation.goalSectionTitle")}</p>
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder={t("dashboard.pages.donation.goalTitlePlaceholder")}
              maxLength={200}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
            <input
              type="number"
              min={0}
              value={goalAmountIDR}
              onChange={(e) => setGoalAmountIDR(e.target.value)}
              placeholder={t("dashboard.pages.donation.goalAmountPlaceholder")}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
            />
          </div>
          {goalAmountNum > 0 && settings && (
            <div className="mt-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-jeon-purple/10">
                <div className="h-full rounded-full bg-jeon-purple transition-all" style={{ width: `${goalProgressPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] font-semibold text-app-ink">
                {formatRupiah(settings.goal_raised_idr)} / {formatRupiah(goalAmountNum)} ({goalProgressPct.toFixed(0)}%)
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.donation.saving") : t("dashboard.pages.donation.save")}
        </button>

        {settings?.product_id && (
          <p className="text-[11px] text-app-muted">
            {t("dashboard.pages.donation.recurringNotSupportedHint")}
          </p>
        )}
      </form>

      {/* Wishlist -- Gap #4 benchmark kompetitif: barang yang bisa
          "diwujudkan" pendukung, tampil di halaman publik sebagai pilihan
          saat mendukung (lihat DonationForm di halaman publik). */}
      <section className="glass mt-6 rounded-jlg p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-purple/10 text-jeon-purple">
            <IconGift className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.donation.wishlistTitle")}</h2>
            <p className="text-xs text-app-muted">{t("dashboard.pages.donation.wishlistSubtitle")}</p>
          </div>
        </div>

        {wishlistError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{wishlistError}</p>}

        <div className="mt-4 flex flex-col gap-2">
          {wishlist.map((w) => {
            const pct = w.price_idr > 0 ? Math.min(100, (w.raised_idr / w.price_idr) * 100) : 0;
            return (
              <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-app-ink">{w.name}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-jeon-purple/10">
                    <div className="h-full rounded-full bg-pop-pink" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-app-muted">
                    {formatRupiah(w.raised_idr)} / {formatRupiah(w.price_idr)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteWishlist(w.id)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  title={t("dashboard.pages.donation.deleteWishlistItemTitle")}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {wishlist.length === 0 && !addingWishlist && <EmptyState text={t("dashboard.pages.donation.wishlistEmpty")} />}
        </div>

        {addingWishlist ? (
          <form onSubmit={handleAddWishlist} className="mt-3 flex flex-col gap-2 rounded-lg border border-app-border p-3">
            <input
              type="text"
              autoFocus
              value={wishlistName}
              onChange={(e) => setWishlistName(e.target.value)}
              placeholder={t("dashboard.pages.donation.wishlistNamePlaceholder")}
              maxLength={200}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <input
              type="number"
              min={1000}
              value={wishlistPrice}
              onChange={(e) => setWishlistPrice(e.target.value)}
              placeholder={t("dashboard.pages.donation.wishlistPricePlaceholder")}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <input
              type="url"
              value={wishlistLink}
              onChange={(e) => setWishlistLink(e.target.value)}
              placeholder={t("dashboard.pages.donation.wishlistLinkPlaceholder")}
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white">
                {t("dashboard.pages.donation.wishlistAdd")}
              </button>
              <button
                type="button"
                onClick={() => setAddingWishlist(false)}
                className="flex-1 rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted"
              >
                {t("dashboard.pages.donation.cancel")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingWishlist(true)}
            className="mt-3 w-full rounded-lg border border-dashed border-app-border py-2 text-xs font-bold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
          >
            + {t("dashboard.pages.donation.wishlistAddItem")}
          </button>
        )}
      </section>
    </div>
  );
}
