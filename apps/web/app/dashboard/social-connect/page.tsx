"use client";

import { useEffect, useState } from "react";
import { ApiError, SocialConnection, disconnectSocial, listSocialConnections } from "@/lib/api-client";
import { buildInstagramAuthUrl, buildTikTokAuthUrl } from "@/lib/social-oauth";
import { IconCheck, IconInstagram, IconTiktok, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// Modul Koneksi Sosial -- permintaan langsung pengguna, 17 Agustus 2026:
// "saya mau jeonme ini bisa connect ke akun kita contoh nya instagram
// tiktok". Diriset dulu lewat benchmark Linktree (BUKAN Lynk.id, yang
// "connect"-nya cuma tautan biasa yang SUDAH ada di Jeonme lewat menu Link
// Bio/Kontak Sosial): "Connect Instagram/TikTok" ASLI adalah OAuth --
// profil + 6 postingan/video TERBARU tampil otomatis di halaman publik,
// bisa dilihat/diputar tanpa keluar dari Jeonme. BEDA dari sekadar
// menambahkan link ke profil Instagram/TikTok kamu (itu tetap ada di menu
// Link Bio seperti biasa, tidak digantikan fitur ini).
function ConnectCard({
  label,
  description,
  Icon,
  appId,
  connection,
  onConnect,
  onDisconnect,
  disconnecting,
}: {
  label: string;
  description: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  appId: string | undefined;
  connection: SocialConnection | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="glass flex flex-col gap-3 rounded-jlg p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-jmd bg-jeon-purple/10 text-jeon-purple">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-app-ink">{label}</p>
          <p className="text-xs text-app-muted">{description}</p>
        </div>
        {connection && (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-jeon-purple/10 text-jeon-purple">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {connection ? (
        <div className="flex items-center justify-between rounded-xl border border-app-border bg-app-surface p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {connection.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={connection.avatar_url} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-jeon-purple/10 text-jeon-purple">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-app-ink">@{connection.external_username}</p>
              <p className="text-[11px] text-app-muted">
                {t("dashboard.pages.socialConnect.connectedSincePrefix")} {new Date(connection.connected_at).toLocaleDateString("id-ID")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            title={t("dashboard.pages.socialConnect.disconnectTitle")}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-app-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      ) : appId ? (
        <button
          type="button"
          onClick={onConnect}
          className="btn-primary rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
        >
          {t("dashboard.pages.socialConnect.connectButtonPrefix")} {label}
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-app-border p-3 text-center text-[11px] text-app-muted">
          {t("dashboard.pages.socialConnect.notConfiguredMessage")}
        </p>
      )}
    </div>
  );
}

export default function SocialConnectPage() {
  const { t } = useLocale();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<"instagram" | "tiktok" | null>(null);

  const instagramAppId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const tiktokClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;

  useEffect(() => {
    listSocialConnections()
      .then(setConnections)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialConnect.loadError")))
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect(platform: "instagram" | "tiktok") {
    const ok = await confirmDelete(
      t("dashboard.pages.socialConnect.disconnectConfirmText").replace("{platform}", platform === "instagram" ? "Instagram" : "TikTok"),
      { title: t("dashboard.pages.socialConnect.disconnectConfirmTitle"), confirmButtonText: t("dashboard.pages.socialConnect.disconnectConfirmButton") }
    );
    if (!ok) return;

    setError(null);
    setDisconnectingPlatform(platform);
    try {
      await disconnectSocial(platform);
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.socialConnect.disconnectError"));
    } finally {
      setDisconnectingPlatform(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-app-muted">{t("dashboard.pages.socialConnect.loading")}</p>;
  }

  const instagramConnection = connections.find((c) => c.platform === "instagram");
  const tiktokConnection = connections.find((c) => c.platform === "tiktok");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.socialConnect.intro")}</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-col gap-3">
        <ConnectCard
          label="Instagram"
          description={t("dashboard.pages.socialConnect.instagramDescription")}
          Icon={IconInstagram}
          appId={instagramAppId}
          connection={instagramConnection}
          onConnect={() => {
            if (instagramAppId) window.location.href = buildInstagramAuthUrl(instagramAppId);
          }}
          onDisconnect={() => handleDisconnect("instagram")}
          disconnecting={disconnectingPlatform === "instagram"}
        />
        <ConnectCard
          label="TikTok"
          description={t("dashboard.pages.socialConnect.tiktokDescription")}
          Icon={IconTiktok}
          appId={tiktokClientKey}
          connection={tiktokConnection}
          onConnect={() => {
            if (tiktokClientKey) window.location.href = buildTikTokAuthUrl(tiktokClientKey);
          }}
          onDisconnect={() => handleDisconnect("tiktok")}
          disconnecting={disconnectingPlatform === "tiktok"}
        />
      </div>
    </div>
  );
}
