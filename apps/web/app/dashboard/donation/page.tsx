"use client";

import { useEffect, useState } from "react";
import { ApiError, DonationSettings, getDonationSettings, upsertDonationSettings } from "@/lib/api-client";
import Toggle from "@/components/Toggle";

export default function DashboardDonationPage() {
  const [settings, setSettings] = useState<DonationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [minAmountIDR, setMinAmountIDR] = useState("");

  useEffect(() => {
    getDonationSettings()
      .then((s) => {
        setSettings(s);
        setEnabled(s.enabled);
        setTitle(s.title || "Traktir aku kopi");
        setMinAmountIDR(s.min_amount_idr ? String(s.min_amount_idr) : "10000");
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
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertDonationSettings({ enabled, title: title.trim(), min_amount_idr: minAmount });
      const refreshed = await getDonationSettings();
      setSettings(refreshed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan dukungan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-bold text-ink">Blok Dukungan</h1>
      <p className="mt-1 text-sm text-muted">
        Biarkan pengunjung memberi dukungan dengan nominal bebas, tanpa harus membeli produk apa pun.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Pengaturan disimpan.</p>}

      <form onSubmit={handleSave} className="mt-6 flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-card">
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

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </button>

        {settings?.product_id && (
          <p className="text-[11px] text-muted">
            Versi awal: nominal sekali bayar saja. Dukungan berulang (mingguan/bulanan) belum didukung.
          </p>
        )}
      </form>
    </div>
  );
}
