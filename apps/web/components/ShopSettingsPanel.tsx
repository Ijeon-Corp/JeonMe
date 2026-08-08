"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, ShopSettings, getShopSettings, updateShopSettings } from "@/lib/api-client";

// Modul Toko (Fase E5): tab Shop Settings -- saat ini cuma "Toko Dijeda"
// (menyembunyikan tombol beli & menolak checkout baru di seluruh toko
// tanpa menonaktifkan tiap produk satu per satu). Pengaturan lain (metode
// pembayaran, dll) sudah punya halaman sendiri di Pengaturan -- sengaja
// TIDAK diduplikasi di sini.
export default function ShopSettingsPanel() {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getShopSettings()
      .then((s) => {
        setSettings(s);
        setMessage(s.shop_paused_message);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengaturan toko."));
  }, []);

  async function save(paused: boolean, msg: string) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const next = await updateShopSettings({ shop_paused: paused, shop_paused_message: msg });
      setSettings(next);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan toko.");
    } finally {
      setSaving(false);
    }
  }

  if (settings === null) {
    return <PageSkeleton />;
  }

  return (
    <div className="mt-4 max-w-xl">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mb-3 rounded-lg bg-secondary-subtle px-3 py-2 text-sm text-secondary-dark">Pengaturan tersimpan.</p>}

      <div className="glass rounded-2xl p-4 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-ink">Jeda Toko Sementara</p>
            <p className="mt-1 text-xs text-muted">
              Sembunyikan tombol beli di semua produk & tolak pesanan baru, tanpa menonaktifkan produk satu per satu.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.shop_paused}
            disabled={saving}
            onClick={() => save(!settings.shop_paused, message)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              settings.shop_paused ? "bg-primary" : "bg-gray-200"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.shop_paused ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="mt-3">
          <label className="text-xs font-semibold text-muted">Pesan untuk pembeli (opsional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Contoh: Toko sedang libur, kembali buka 10 Agustus"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm text-ink"
          />
          <button
            type="button"
            disabled={saving || message === settings.shop_paused_message}
            onClick={() => save(settings.shop_paused, message)}
            className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary disabled:opacity-50"
          >
            Simpan Pesan
          </button>
        </div>
      </div>
    </div>
  );
}
