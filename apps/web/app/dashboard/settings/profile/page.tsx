"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, SettingsProfile, getSettingsProfile, updateSettingsProfile } from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight, IconQrCode } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import QRCodeModal from "@/components/QRCodeModal";
import { SITE_URL } from "@/lib/site";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

// Modul Settings §2: display_name/bio DITULIS ke tabel pages (kolom yang
// sama dipakai halaman Desain/PagePreview) -- SENGAJA tidak menduplikasi
// field, cuma menambah apa yang belum ada (ganti username + category).
// Foto profil tetap diatur di halaman Desain (PageHandler.UploadAvatar),
// cuma dipratinjau di sini sebagai referensi.
export default function SettingsProfilePage() {
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

  useEffect(() => {
    getSettingsProfile()
      .then((p) => {
        setOriginal(p);
        setUsername(p.username);
        setCategory(p.category);
        setDisplayName(p.display_name);
        setBio(p.bio);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat profil."))
      .finally(() => setLoading(false));
  }, []);

  const usernameChanged = original !== null && username.trim() !== original.username;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!original) return;

    const trimmedUsername = username.trim();
    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      setError("Username harus 3-30 karakter, hanya huruf/angka/underscore.");
      return;
    }
    if (usernameChanged) {
      const confirmed = await confirmAction(
        `Ganti username dari @${original.username} ke @${trimmedUsername}? Alamat lama tetap dialihkan otomatis selama 90 hari, tapi tautan yang sudah kamu bagikan sebaiknya tetap diperbarui.`,
        { confirmButtonText: "Ya, Ganti Username" }
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
      setOriginal({ ...original, username: res.username, category, display_name: displayName, bio });
      setUsername(res.username);
      showToast("Profil berhasil disimpan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menyimpan profil.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageSkeleton />;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-primary"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        Pengaturan
      </Link>

      <h1 className="mt-3 font-heading text-2xl font-bold text-ink">Profil & Akun</h1>
      <p className="mt-1 text-sm text-muted">
        Foto profil & tema halaman diatur lewat halaman{" "}
        <Link href="/dashboard/design" className="font-semibold text-primary hover:underline">
          Desain
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
            className="h-16 w-16 rounded-full border border-border object-cover"
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
            className="flex items-center gap-1.5 rounded-xl border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:border-primary hover:text-primary"
          >
            <IconQrCode className="h-4 w-4" />
            Lihat Kode QR
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <label htmlFor="settings-username" className="text-xs font-bold uppercase tracking-wider text-muted">
            Username
          </label>
          <div className="mt-1 flex items-center rounded-xl border border-border bg-white focus-within:border-primary">
            <span className="pl-3 text-sm text-muted">jeon.id/</span>
            <input
              id="settings-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              className="w-full rounded-r-xl py-2.5 pr-3 text-sm text-ink focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Ganti username tetap mengalihkan pengunjung dari alamat lama selama 90 hari, jadi tautan yang sudah
            dibagikan tidak langsung 404.
          </p>
        </div>

        <div>
          <label htmlFor="settings-display-name" className="text-xs font-bold uppercase tracking-wider text-muted">
            Nama Tampilan
          </label>
          <input
            id="settings-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder={username}
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="settings-bio" className="text-xs font-bold uppercase tracking-wider text-muted">
            Bio
          </label>
          <textarea
            id="settings-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-muted">{bio.length}/160</p>
        </div>

        <div>
          <label htmlFor="settings-category" className="text-xs font-bold uppercase tracking-wider text-muted">
            Kategori
          </label>
          <input
            id="settings-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={50}
            placeholder="mis. Musik, Pendidikan, Kuliner"
            className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-2 self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan Perubahan"}
        </button>
      </form>

      {qrOpen && original?.username && (
        <QRCodeModal url={`${SITE_URL}/${original.username}`} username={original.username} onClose={() => setQrOpen(false)} />
      )}
    </div>
  );
}
