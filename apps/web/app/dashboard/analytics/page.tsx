"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, getAnalyticsSettings, getMyPage, upsertAnalyticsSettings } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import { IconLock } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import { useErrorToast } from "@/lib/use-error-toast";
import { SITE_URL } from "@/lib/site";
import UtmLinkBuilder from "@/components/dashboard/UtmLinkBuilder";

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
  const { t } = useLocale();
  // Tiap integrasi jadi kartu terpisah (Meta Pixel & CAPI / Google
  // Analytics / UTM) dalam SATU form+simpan (SPEC §18.2, Phase 7); token
  // tetap tidak pernah dikirim balik. LENGKAP & stabil di production
  // sejak v0.37.0/v0.38.0, flag "settings" dihapus dari file ini 8
  // September 2026.
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
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
  // username -- HANYA utk mengisi default "Halaman tujuan" di UtmLinkBuilder
  // (permintaan langsung pengguna, 17 September 2026: "kerjakan buildernya").
  // Tidak terkait apa pun dgn AnalyticsSettings, jadi diambil lewat panggilan
  // getMyPage() TERPISAH (Promise.all, bukan berurutan) supaya tidak menunda
  // render form pengaturan yang sudah ada kalau salah satu panggilan lambat.
  const [username, setUsername] = useState("");
  // tab -- permintaan langsung pengguna, 17 September 2026 ("page yang
  // memanjang sepertini bagus nya di jadikan 2 kolom atau dibuatkan tabs"):
  // 4 kartu bertumpuk vertikal terasa ramai/panjang, apalagi sejak
  // UtmLinkBuilder ditambahkan. Tabs dipilih drpd grid 2 kolom (dikonfirmasi
  // lewat diskusi) -- kontennya memang dua konteks beda sifat (pixel/GA/UTM
  // = setup sekali + satu tombol Simpan bersama, vs builder link = tool
  // dipakai berulang tanpa Simpan sama sekali), grid 2 kolom kartu-kartu
  // dgn tinggi timpang (Meta Pixel 2 field vs GA 1 field vs builder 6+
  // field) berisiko malah tambah berantakan, dan di lebar HP grid 2 kolom
  // collapse jadi 1 kolom juga (nol manfaat) sedangkan tabs sama baiknya di
  // kedua lebar layar. State lokal saja (bukan ?tab= URL) -- tidak ada
  // pemanggil lain yang perlu deep-link ke tab tertentu di halaman ini.
  const [tab, setTab] = useState<"pixel" | "builder">("pixel");

  useEffect(() => {
    Promise.all([getAnalyticsSettings(), getMyPage()])
      .then(([s, page]) => {
        setFbPixelId(s.fb_pixel_id);
        setFbAccessTokenSet(s.fb_access_token_set);
        setGaMeasurementId(s.ga_measurement_id);
        setUtmEnabled(s.utm_enabled);
        setIsPremium(s.is_premium);
        setUsername(page.username);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.analytics.loadError")))
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.analytics.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageSkeleton />;

  const TABS: { key: "pixel" | "builder"; label: string }[] = [
    { key: "pixel", label: t("dashboard.pages.analytics.tabPixel") },
    { key: "builder", label: t("dashboard.pages.analytics.tabBuilder") },
  ];

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("dashboard.nav.analyticsPixels")} description={t("dashboard.pages.analytics.intro")} />

      <div className="mb-5 flex items-center gap-1 border-b border-app-border" role="tablist">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            className={`relative whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
              tab === tb.key ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
            }`}
          >
            {tb.label}
            {tab === tb.key && <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-jeon-purple" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {tab === "pixel" && (
        <>
          {!isPremium && (
            <p className="mb-3 flex items-start gap-2 rounded-lg bg-jeon-purple/10 px-3 py-2.5 text-xs font-semibold text-jeon-purple">
              <IconLock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {t("dashboard.pages.analytics.premiumNotice")}
            </p>
          )}

          {saved && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.analytics.saved")}</p>}

          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="glass rounded-jlg p-5 shadow-card">
              <p className="text-sm font-bold text-app-ink">Meta Pixel & Conversions API</p>

              <label className="mb-1 mt-3 block text-xs font-semibold text-app-ink">Pixel ID</label>
              <input
                type="text"
                value={fbPixelId}
                onChange={(e) => setFbPixelId(e.target.value)}
                placeholder={t("dashboard.pages.analytics.pixelIdPlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />

              <label className="mb-1 mt-3 block text-xs font-semibold text-app-ink">Facebook Conversions API Access Token</label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => {
                  setTokenInput(e.target.value);
                  if (e.target.value) setClearToken(false);
                }}
                placeholder={
                  fbAccessTokenSet && !clearToken
                    ? t("dashboard.pages.analytics.tokenPlaceholderSet")
                    : t("dashboard.pages.analytics.tokenPlaceholderEmpty")
                }
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
              <div className="mt-1 flex items-center justify-between">
                <p className="text-[11px] text-app-muted">{t("dashboard.pages.analytics.tokenHint")}</p>
                {fbAccessTokenSet && !clearToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setClearToken(true);
                      setTokenInput("");
                    }}
                    className="text-[11px] font-bold text-red-600 hover:underline"
                  >
                    {t("dashboard.pages.analytics.clearTokenButton")}
                  </button>
                )}
              </div>
              {clearToken && <p className="mt-1 text-[11px] font-semibold text-red-600">{t("dashboard.pages.analytics.tokenWillBeCleared")}</p>}
            </div>

            <div className="glass rounded-jlg p-5 shadow-card">
              <p className="text-sm font-bold text-app-ink">Google Analytics</p>
              <label className="mb-1 mt-3 block text-xs font-semibold text-app-ink">Google Measurement ID</label>
              <input
                type="text"
                value={gaMeasurementId}
                onChange={(e) => setGaMeasurementId(e.target.value)}
                placeholder={t("dashboard.pages.analytics.gaMeasurementIdPlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>

            <div className="glass flex items-center justify-between rounded-jlg p-5 shadow-card">
              <div>
                <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.analytics.utmTitle")}</p>
                <p className="mt-0.5 text-xs text-app-muted">{t("dashboard.pages.analytics.utmDescription")}</p>
              </div>
              <Toggle checked={utmEnabled} onChange={() => setUtmEnabled((v) => !v)} label={t("dashboard.pages.analytics.utmToggleLabel")} />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? t("dashboard.pages.analytics.saving") : t("dashboard.pages.analytics.save")}
            </button>
          </form>
        </>
      )}

      {/* UtmLinkBuilder -- tab TERPISAH dari form di atas SENGAJA: murni
          utilitas klien (bikin string URL), tidak ada apa pun di sini yang
          perlu ikut tersimpan lewat handleSave/upsertAnalyticsSettings, dan
          tidak digerbang Premium (beda dari tab Pixel & Analytics). */}
      {tab === "builder" && username && <UtmLinkBuilder defaultUrl={`${SITE_URL}/${username}`} />}
    </div>
  );
}
