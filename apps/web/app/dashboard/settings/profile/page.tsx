"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ApiError,
  SettingsProfile,
  checkUsername,
  clearToken,
  getSettingsProfile,
  logout as apiLogout,
  updateSettingsProfile,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconChevronRight, IconClose, IconLogout, IconQrCode } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import QRCodeModal from "@/components/QRCodeModal";
import { SITE_URL } from "@/lib/site";
import { useLocale } from "@/lib/locale-context";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

type UsernameCheckState = "idle" | "checking" | "available" | "unavailable";

function formatCooldownDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

// Modul Settings §2: display_name/bio DITULIS ke tabel pages (kolom yang
// sama dipakai halaman Desain/PagePreview) -- SENGAJA tidak menduplikasi
// field, cuma menambah apa yang belum ada (ganti username + category).
// Foto profil tetap diatur di halaman Desain (PageHandler.UploadAvatar),
// cuma dipratinjau di sini sebagai referensi.
export default function SettingsProfilePage() {
  const { t } = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [original, setOriginal] = useState<SettingsProfile | null>(null);
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState<{ username: string; state: UsernameCheckState; message: string }>({
    username: "",
    state: "idle",
    message: "",
  });

  useEffect(() => {
    getSettingsProfile()
      .then((p) => {
        setOriginal(p);
        setUsername(p.username);
        setCategory(p.category);
        setDisplayName(p.display_name);
        setBio(p.bio);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.settingsProfile.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  const usernameChanged = original !== null && username.trim() !== original.username;
  const cooldownUntil = original?.username_change_available_at ?? null;
  const cooldownActive = cooldownUntil !== null;

  // Live-check ketersediaan username -- permintaan langsung pengguna, 19
  // Agustus 2026, sama seperti /register (checkUsername.ts). BEDA di sini:
  // dilewati kalau nilainya sama dengan original.username (belum benar-benar
  // diganti, endpoint publik /auth/check-username tidak tahu cara
  // mengecualikan baris milik pemanggil sendiri jadi akan salah melaporkan
  // "sudah dipakai") ATAUPUN kalau cooldown 30 hari sedang aktif (field
  // otomatis di-disable, tidak perlu nge-hit API sama sekali).
  useEffect(() => {
    const trimmed = username.trim();
    const timer = setTimeout(() => {
      if (cooldownActive || trimmed.length < 3 || trimmed === original?.username) {
        setUsernameCheck({ username: trimmed, state: "idle", message: "" });
        return;
      }
      setUsernameCheck({ username: trimmed, state: "checking", message: "" });
      checkUsername(trimmed)
        .then((res) => {
          setUsernameCheck({ username: trimmed, state: res.available ? "available" : "unavailable", message: res.message });
        })
        .catch(() => {
          setUsernameCheck({ username: trimmed, state: "idle", message: "" });
        });
    }, 500);
    return () => clearTimeout(timer);
  }, [username, original, cooldownActive]);

  // Abaikan hasil check yang sudah basi (username berubah lagi setelah hasil
  // sebelumnya datang, sebelum debounce berikutnya sempat jalan).
  const usernameState: UsernameCheckState = usernameCheck.username === username.trim() ? usernameCheck.state : "idle";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!original) return;

    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError(t("dashboard.pages.settingsProfile.usernamePatternError"));
      return;
    }
    if (usernameChanged) {
      const confirmed = await confirmAction(
        t("dashboard.pages.settingsProfile.changeUsernameConfirm")
          .replace("{old}", original.username)
          .replace("{new}", trimmedUsername),
        { confirmButtonText: t("dashboard.pages.settingsProfile.changeUsernameConfirmButton") }
      );
      if (!confirmed) return;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await updateSettingsProfile({
        username: trimmedUsername !== original.username ? trimmedUsername : undefined,
        category: category !== original.category ? category : undefined,
        display_name: displayName !== original.display_name ? displayName : undefined,
        bio: bio !== original.bio ? bio : undefined,
      });
      setOriginal({
        ...original,
        username: res.username,
        category,
        display_name: displayName,
        bio,
        // Cooldown 30 hari mulai berlaku SEKARANG kalau username baru saja
        // diganti -- dihitung optimis di klien (bukan menunggu GET ulang)
        // supaya field langsung ter-disable, konsisten dengan apa yang
        // backend akan tegakkan kalau dicoba lagi detik ini juga.
        username_change_available_at: usernameChanged
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : original.username_change_available_at,
      });
      setUsername(res.username);
      showToast(t("dashboard.pages.settingsProfile.saveSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsProfile.saveError"), "error");
    } finally {
      setSaving(false);
    }
  }

  // handleLogout -- permintaan langsung pengguna, 30 Agustus 2026: "fitur
  // logout pindah ke profile hilangkan dari sidebar". Ditaruh di sini
  // (bukan dropdown baru di topbar) supaya tetap terjangkau di MOBILE juga
  // -- drawer sidebar mobile pakai sidebarContent yang SAMA dengan aside
  // desktop, jadi tombol Keluar yang dihapus dari sana hilang dari kedua
  // tempat sekaligus kalau tidak dipindah ke suatu halaman yang tetap bisa
  // dibuka dari mana pun (topbar desktop & menu Pengaturan sidebar mobile
  // sama-sama mengarah ke halaman Profil & Akun ini).
  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // Tetap lanjut hapus token lokal walau request revoke ke server gagal.
    } finally {
      clearToken();
      router.push("/login");
    }
  }

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-jeon-purple"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {t("dashboard.pages.settingsProfile.breadcrumb")}
      </Link>

      <h1 className="mt-3 font-heading text-2xl font-bold text-app-ink">{t("dashboard.pages.settingsProfile.title")}</h1>
      <p className="mt-1 text-sm text-app-muted">
        {t("dashboard.pages.settingsProfile.subtitlePrefix")}{" "}
        <Link href="/dashboard/design" className="font-semibold text-jeon-purple hover:underline">
          {t("dashboard.pages.settingsProfile.designLinkLabel")}
        </Link>
        .
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        {original?.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element -- pratinjau kecil, tidak perlu next/image di sini
          <img
            src={original.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full border border-app-border object-cover"
          />
        )}
        {/* Kode QR profil (permintaan langsung pengguna, 18 Agustus 2026:
            "tambahkan qr code di settings profile") -- QRCodeModal SUDAH
            dipasang di top bar dashboard (dashboard/layout.tsx) & fitur
            Kartu Kontak, ditambahkan lagi di sini karena halaman Profil &
            Akun ini tempat paling wajar mencarinya (identitas akun),
            dibanding harus tahu dulu ada tombol tersembunyi di top bar.
            SENGAJA pakai original.username (nilai TERSIMPAN/live di
            server), BUKAN state `username` yang terikat ke input field --
            kalau kreator sedang mengetik ganti username tapi belum klik
            "Simpan Perubahan", QR yang dibuat dari nilai belum tersimpan
            itu akan mengarah ke alamat yang belum tentu benar-benar hidup. */}
        {original?.username && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-app-border bg-app-surface px-3.5 py-2 text-xs font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
          >
            <IconQrCode className="h-4 w-4" />
            {t("dashboard.pages.settingsProfile.viewQrCode")}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="settings-username" className="text-xs font-bold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.settingsProfile.usernameLabel")}
          </label>
          <div
            className={`mt-1 flex items-center rounded-xl border bg-app-surface transition-colors focus-within:ring-2 ${
              usernameState === "available"
                ? "border-jeon-purple focus-within:border-jeon-purple focus-within:ring-secondary/20"
                : usernameState === "unavailable"
                ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-200"
                : "border-app-border focus-within:border-jeon-purple focus-within:ring-jeon-purple/20"
            }`}
          >
            <span className="pl-3 text-sm text-app-muted">jeon.id/</span>
            {/* focus:!shadow-none -- glow fokus global (globals.css,
                `input:not([type=checkbox]):not([type=radio]):focus`) selektornya
                lebih spesifik daripada utility Tailwind biasa, jadi tanpa `!`
                glow bawaan tetap muncul sebagai kotak abu-abu yang tidak
                mengikuti bentuk pil pembungkus -- persis menutupi "/" di
                "jeon.id/" (dilaporkan pengguna: "ketika di klik bagian
                username kenapa seperti memblok bagian /"). Bug & fix yang
                sama persis sudah ada di /register, lihat komentar di sana. */}
            <input
              id="settings-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              disabled={cooldownActive}
              className="w-full rounded-r-xl py-2.5 pr-3 text-sm text-app-ink focus:!shadow-none focus:outline-none disabled:cursor-not-allowed disabled:text-app-muted disabled:opacity-70"
            />
          </div>
          {cooldownActive && cooldownUntil ? (
            <p className="mt-1 text-xs text-app-muted">
              {t("dashboard.pages.settingsProfile.cooldownActive").replace("{date}", formatCooldownDate(cooldownUntil))}
            </p>
          ) : (
            <>
              {usernameState !== "idle" && (
                <p
                  className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                    usernameState === "available"
                      ? "text-jeon-purple"
                      : usernameState === "unavailable"
                      ? "text-red-600"
                      : "text-app-muted"
                  }`}
                >
                  {usernameState === "checking" && t("dashboard.pages.settingsProfile.checkingAvailability")}
                  {usernameState === "available" && (
                    <>
                      <IconCheck className="h-3.5 w-3.5 flex-shrink-0" /> {t("dashboard.pages.settingsProfile.usernameAvailable")}
                    </>
                  )}
                  {usernameState === "unavailable" && (
                    <>
                      {/* usernameCheck.message berasal LANGSUNG dari respons API
                          (endpoint publik /auth/check-username) -- teksnya
                          dihasilkan backend, sengaja TIDAK diterjemahkan di sini
                          (di luar cakupan, butuh perubahan backend). */}
                      <IconClose className="h-3.5 w-3.5 flex-shrink-0" /> {usernameCheck.message}
                    </>
                  )}
                </p>
              )}
              <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.settingsProfile.usernameChangeHelper")}</p>
            </>
          )}
        </div>

        <div>
          <label htmlFor="settings-display-name" className="text-xs font-bold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.settingsProfile.displayNameLabel")}
          </label>
          <input
            id="settings-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder={username}
            className="mt-1 w-full rounded-xl border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="settings-bio" className="text-xs font-bold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.settingsProfile.bioLabel")}
          </label>
          <textarea
            id="settings-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            className="mt-1 w-full rounded-xl border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-app-muted">{bio.length}/160</p>
        </div>

        <div>
          <label htmlFor="settings-category" className="text-xs font-bold uppercase tracking-wider text-app-muted">
            {t("dashboard.pages.settingsProfile.categoryLabel")}
          </label>
          <input
            id="settings-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={50}
            placeholder={t("dashboard.pages.settingsProfile.categoryPlaceholder")}
            className="mt-1 w-full rounded-xl border border-app-border bg-app-surface px-3 py-2.5 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-2 self-start rounded-xl bg-jeon-purple px-5 py-2.5 text-sm font-bold text-white hover:bg-jeon-purple-dark disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.settingsProfile.saving") : t("dashboard.pages.settingsProfile.saveChanges")}
        </button>
      </form>

      <div className="mt-6 border-t border-app-border pt-5">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl border border-app-border px-4 py-2.5 text-sm font-semibold text-red-600 hover:border-red-300"
        >
          <IconLogout className="h-4 w-4" />
          {t("dashboard.logout")}
        </button>
      </div>

      {qrOpen && original?.username && (
        <QRCodeModal url={`${SITE_URL}/${original.username}`} username={original.username} onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}
