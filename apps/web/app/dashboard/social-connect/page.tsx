"use client";

import { useEffect, useState } from "react";
import { ApiError, SocialConnection, disconnectSocial, listSocialConnections } from "@/lib/api-client";
import { buildInstagramAuthUrl, buildTikTokAuthUrl } from "@/lib/social-oauth";
import { IconCheck, IconInstagram, IconTiktok, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";

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
  return (
    <div className="glass flex flex-col gap-3 rounded-3xl p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-bold text-ink">{label}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
        {connection && (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      {connection ? (
        <div className="flex items-center justify-between rounded-xl border border-border bg-white p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {connection.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={connection.avatar_url} alt="" className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">@{connection.external_username}</p>
              <p className="text-[11px] text-muted">Tersambung {new Date(connection.connected_at).toLocaleDateString("id-ID")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={disconnecting}
            title="Putuskan koneksi"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
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
          Sambungkan {label}
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-[11px] text-muted">
          Fitur ini belum dikonfigurasi di server Jeonme.
        </p>
      )}
    </div>
  );
}

export default function SocialConnectPage() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<"instagram" | "tiktok" | null>(null);

  const instagramAppId = process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID;
  const tiktokClientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;

  useEffect(() => {
    listSocialConnections()
      .then(setConnections)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat koneksi sosial."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect(platform: "instagram" | "tiktok") {
    const ok = await confirmDelete(
      `Halaman publikmu tidak akan lagi menampilkan feed ${platform === "instagram" ? "Instagram" : "TikTok"} otomatis.`,
      { title: "Putuskan koneksi?", confirmButtonText: "Ya, Putuskan" }
    );
    if (!ok) return;

    setError(null);
    setDisconnectingPlatform(platform);
    try {
      await disconnectSocial(platform);
      setConnections((prev) => prev.filter((c) => c.platform !== platform));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memutus koneksi.");
    } finally {
      setDisconnectingPlatform(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted">Memuat...</p>;
  }

  const instagramConnection = connections.find((c) => c.platform === "instagram");
  const tiktokConnection = connections.find((c) => c.platform === "tiktok");

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-muted">
        Sambungkan akun Instagram/TikTok kreator supaya profil dan beberapa postingan/video terbarumu tampil otomatis di halaman
        publik -- tidak perlu update manual. Ini terpisah dari tautan Instagram/TikTok biasa di menu Link Bio.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-col gap-3">
        <ConnectCard
          label="Instagram"
          description="Tampilkan 6 postingan/reels terbaru. Akun harus tipe Professional (Creator/Business)."
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
          description="Tampilkan 6 video terbaru, bisa diputar langsung dari halamanmu."
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
