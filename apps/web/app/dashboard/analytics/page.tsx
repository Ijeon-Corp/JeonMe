"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, getAnalyticsSettings, upsertAnalyticsSettings } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import { IconLock } from "@/components/icons";

// DashboardAnalyticsPage -- Modul Analitik Pihak Ketiga (permintaan
// langsung pengguna, 12 Agustus 2026, referensi tangkapan layar panel
// "Analytics" Linktree): Facebook Pixel + Conversions API, Google
// Analytics (GA4), toggle parameter UTM. Struktur/pola form SAMA PERSIS
// dengan /dashboard/social-proof (loading state, error/saved banner,
// satu form "glass" card) supaya konsisten dengan hub pengaturan lain.
//
// Fitur PREMIUM (ikon gembok di referensi) -- TAPI form tetap BISA diisi
// & disimpan oleh akun gratis (lihat catatan lengkap di
// AnalyticsSettingsHandler backend) supaya isian tidak hilang begitu
// upgrade -- pesan di bawah cuma memberi tahu bahwa efeknya (skrip
// Pixel/gtag.js tampil ke pengunjung, event Conversions API terkirim)
// baru benar-benar aktif setelah Premium, BUKAN memblokir form.
export default function DashboardAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const [fbPixelId, setFbPixelId] = useState("");
  const [fbAccessTokenSet, setFbAccessTokenSet] = useState(false);
  // tokenInput -- SELALU mulai kosong, TIDAK PERNAH diisi dari respons API
  // (token tersimpan tidak pernah dikirim balik utuh, lihat
  // AnalyticsSettings.fb_access_token_set di api-client.ts) -- diisi cuma
  // kalau kreator mau MENGGANTI token yang sudah ada.
  const [tokenInput, setTokenInput] = useState("");
  const [clearToken, setClearToken] = useState(false);
  const [gaMeasurementId, setGaMeasurementId] = useState("");
  const [utmEnabled, setUtmEnabled] = useState(false);

  useEffect(() => {
    getAnalyticsSettings()
      .then((s) => {
        setFbPixelId(s.fb_pixel_id);
        setFbAccessTokenSet(s.fb_access_token_set);
        setGaMeasurementId(s.ga_measurement_id);
        setUtmEnabled(s.utm_enabled);
        setIsPremium(s.is_premium);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengaturan analitik."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertAnalyticsSettings({
        fb_pixel_id: fbPixelId.trim(),
        // clearToken menang kalau keduanya somehow aktif -- tapi UI
        // menyembunyikan tombol "Hapus" begitu kreator mulai mengetik,
        // jadi seharusnya tidak pernah terjadi bersamaan.
        fb_access_token: clearToken ? "" : tokenInput.trim() ? tokenInput.trim() : undefined,
        ga_measurement_id: gaMeasurementId.trim(),
        utm_enabled: utmEnabled,
      });
      setFbAccessTokenSet(clearToken ? false : tokenInput.trim() ? true : fbAccessTokenSet);
      setTokenInput("");
      setClearToken(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted">Integrasikan pixel untuk melacak pengunjung halamanmu di Facebook dan Google.</p>
      </div>

      {!isPremium && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-primary-subtle px-3 py-2.5 text-xs font-semibold text-primary">
          <IconLock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Fitur Premium -- boleh diisi & disimpan sekarang, tapi skrip pelacakan baru aktif di halaman publikmu setelah
          berlangganan Premium.
        </p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Pengaturan disimpan.</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-5 rounded-3xl p-5 shadow-card">
        <div>
          <p className="text-sm font-bold text-ink">Facebook</p>

          <label className="mb-1 mt-3 block text-xs font-semibold text-ink">Pixel ID</label>
          <input
            type="text"
            value={fbPixelId}
            onChange={(e) => setFbPixelId(e.target.value)}
            placeholder="Contoh: 1234567890"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          <label className="mb-1 mt-3 block text-xs font-semibold text-ink">Facebook Conversions API Access Token</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => {
              setTokenInput(e.target.value);
              if (e.target.value) setClearToken(false);
            }}
            placeholder={fbAccessTokenSet && !clearToken ? "•••••••• (tersimpan, isi untuk mengganti)" : "Token dari Facebook Events Manager"}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="mt-1 flex items-center justify-between">
            <p className="text-[11px] text-muted">Token dari Facebook Events Manager.</p>
            {fbAccessTokenSet && !clearToken && (
              <button
                type="button"
                onClick={() => {
                  setClearToken(true);
                  setTokenInput("");
                }}
                className="text-[11px] font-bold text-red-600 hover:underline"
              >
                Hapus token
              </button>
            )}
          </div>
          {clearToken && <p className="mt-1 text-[11px] font-semibold text-red-600">Token akan dihapus saat disimpan.</p>}
        </div>

        <div>
          <p className="text-sm font-bold text-ink">Google</p>
          <label className="mb-1 mt-3 block text-xs font-semibold text-ink">Google Measurement ID</label>
          <input
            type="text"
            value={gaMeasurementId}
            onChange={(e) => setGaMeasurementId(e.target.value)}
            placeholder="Contoh: G-XXXXXXXXXX"
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-sm font-bold text-ink">Parameter UTM</p>
            <p className="mt-0.5 text-xs text-muted">
              Tandai halaman Jeon.id-mu sebagai trafik &apos;social&apos; di Google Analytics. Parameter kampanye diatur
              otomatis dari judul tiap tautan.
            </p>
          </div>
          <Toggle checked={utmEnabled} onChange={() => setUtmEnabled((v) => !v)} label="Aktifkan parameter UTM" />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </form>
    </div>
  );
}
