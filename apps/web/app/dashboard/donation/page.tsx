"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengaturan dukungan."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const minAmount = Number(minAmountIDR);
    if (enabled && (!title.trim() || !minAmount || minAmount < 1000)) {
      setError("Judul wajib diisi dan nominal minimum minimal Rp1.000.");
      return;
    }
    const goalAmount = goalAmountIDR ? Number(goalAmountIDR) : 0;
    if (goalAmount > 0 && !goalTitle.trim()) {
      setError("Judul target wajib diisi kalau mengatur target donasi.");
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
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan dukungan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddWishlist(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(wishlistPrice);
    if (!wishlistName.trim() || !price || price < 1000) {
      setWishlistError("Nama wajib diisi dan harga minimal Rp1.000.");
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
      setWishlistError(err instanceof ApiError ? err.message : "Gagal menambah wishlist.");
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
      <p className="mt-1 text-sm text-muted">
        Biarkan pengunjung memberi dukungan dengan nominal bebas, tanpa harus membeli produk apa pun.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Pengaturan disimpan.</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-3xl p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Aktifkan Blok Dukungan</p>
            <p className="text-xs text-muted">Tampil di halaman publikmu kalau aktif.</p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label="Aktifkan blok dukungan" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Judul</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Traktir aku kopi"
            maxLength={200}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Nominal Minimum (Rp)</label>
          <input
            type="number"
            min={1000}
            value={minAmountIDR}
            onChange={(e) => setMinAmountIDR(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-[11px] text-muted">Pengunjung tetap bebas memberi lebih dari nominal ini.</p>
        </div>

        {/* Target Donasi -- Gap #4 benchmark kompetitif (9 Agustus 2026, ala
            goal Saweria/Trakteer): progress bar publik, direset ke nol
            setiap kali target diganti (lihat catatan donation_goal_started_at
            di backend) -- BUKAN akumulasi sepanjang masa. */}
        <div className="rounded-2xl border border-dashed border-border p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Target Donasi (opsional)</p>
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="mis. Upgrade kamera streaming"
              maxLength={200}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="number"
              min={0}
              value={goalAmountIDR}
              onChange={(e) => setGoalAmountIDR(e.target.value)}
              placeholder="Target nominal (Rp), kosongkan untuk hapus target"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {goalAmountNum > 0 && settings && (
            <div className="mt-3">
              <div className="h-2.5 overflow-hidden rounded-full bg-primary-subtle">
                <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${goalProgressPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] font-semibold text-ink">
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
          {saving ? "Menyimpan..." : "Simpan"}
        </button>

        {settings?.product_id && (
          <p className="text-[11px] text-muted">
            Versi awal: nominal sekali bayar saja. Dukungan berulang (mingguan/bulanan) belum didukung.
          </p>
        )}
      </form>

      {/* Wishlist -- Gap #4 benchmark kompetitif: barang yang bisa
          "diwujudkan" pendukung, tampil di halaman publik sebagai pilihan
          saat mendukung (lihat DonationForm di halaman publik). */}
      <section className="glass mt-6 rounded-3xl p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-pop-pink-tint text-pop-pink">
            <IconGift className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-heading text-lg font-bold text-ink">Wishlist</h2>
            <p className="text-xs text-muted">Barang yang bisa dipilih pendukung untuk &quot;diwujudkan&quot; saat mendukung.</p>
          </div>
        </div>

        {wishlistError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{wishlistError}</p>}

        <div className="mt-4 flex flex-col gap-2">
          {wishlist.map((w) => {
            const pct = w.price_idr > 0 ? Math.min(100, (w.raised_idr / w.price_idr) * 100) : 0;
            return (
              <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{w.name}</p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-subtle">
                    <div className="h-full rounded-full bg-pop-pink" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {formatRupiah(w.raised_idr)} / {formatRupiah(w.price_idr)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteWishlist(w.id)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  title="Hapus item wishlist"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {wishlist.length === 0 && !addingWishlist && <EmptyState text="Belum ada item wishlist." />}
        </div>

        {addingWishlist ? (
          <form onSubmit={handleAddWishlist} className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3">
            <input
              type="text"
              autoFocus
              value={wishlistName}
              onChange={(e) => setWishlistName(e.target.value)}
              placeholder="Nama barang"
              maxLength={200}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="number"
              min={1000}
              value={wishlistPrice}
              onChange={(e) => setWishlistPrice(e.target.value)}
              placeholder="Harga (Rp)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              type="url"
              value={wishlistLink}
              onChange={(e) => setWishlistLink(e.target.value)}
              placeholder="Tautan produk (opsional)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white">
                Tambah
              </button>
              <button
                type="button"
                onClick={() => setAddingWishlist(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted"
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAddingWishlist(true)}
            className="mt-3 w-full rounded-lg border border-dashed border-border py-2 text-xs font-bold text-muted hover:border-primary hover:text-primary"
          >
            + Tambah Item Wishlist
          </button>
        )}
      </section>
    </div>
  );
}
