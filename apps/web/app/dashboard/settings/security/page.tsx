"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeCanvas } from "qrcode.react";
import {
  ActiveSession,
  ApiError,
  TwoFactorStatus,
  changePassword,
  disable2FA,
  enable2FA,
  get2FAStatus,
  listSessions,
  revokeSession,
  verify2FA,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight, IconTrash } from "@/components/icons";

// Modul Settings §5. Sesi TIDAK punya tabel Postgres sendiri (dibangun di
// atas denylist jti Redis yang sudah ada, lihat session.go backend) -- jadi
// "id" sesi di sini SEBENARNYA adalah jti token itu sendiri.
export default function SettingsSecurityPage() {
  const { showToast } = useToast();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setupSecret, setSetupSecret] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function loadStatus() {
    get2FAStatus()
      .then(setStatus)
      .catch(() => {
        // Non-fatal -- bagian lain halaman tetap bisa dipakai.
      });
  }

  useEffect(() => {
    loadStatus();
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    try {
      await changePassword({ old_password: oldPassword, new_password: newPassword });
      setOldPassword("");
      setNewPassword("");
      showToast("Password berhasil diganti.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal mengganti password.", "error");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleStart2FA() {
    try {
      const res = await enable2FA();
      setSetupSecret(res);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal memulai setup 2FA.", "error");
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    try {
      await verify2FA(verifyCode);
      setSetupSecret(null);
      setVerifyCode("");
      loadStatus();
      showToast("2FA berhasil diaktifkan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Kode 2FA salah.", "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisable2FA(e: React.FormEvent) {
    e.preventDefault();
    setDisabling(true);
    try {
      await disable2FA(disablePassword);
      setDisablePassword("");
      setShowDisableForm(false);
      loadStatus();
      showToast("2FA dinonaktifkan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menonaktifkan 2FA.", "error");
    } finally {
      setDisabling(false);
    }
  }

  // Optimistic UI + rollback (requirement UI wajib Modul Settings) -- sesi
  // langsung hilang dari daftar, dikembalikan kalau API-nya gagal.
  async function handleRevokeSession(id: string) {
    if (!sessions) return;
    const previous = sessions;
    setRevokingId(id);
    setSessions(sessions.filter((s) => s.id !== id));
    try {
      await revokeSession(id);
      showToast("Sesi dicabut.");
    } catch (err) {
      setSessions(previous);
      showToast(err instanceof ApiError ? err.message : "Gagal mencabut sesi.", "error");
    } finally {
      setRevokingId(null);
    }
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

      <h1 className="mt-3 font-heading text-2xl font-bold text-ink">Keamanan</h1>
      <p className="mt-1 text-sm text-muted">Password, verifikasi dua langkah, dan sesi aktif.</p>

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Ganti Password</h2>
        <form onSubmit={handleChangePassword} className="mt-3 flex flex-col gap-3">
          <input
            type="password"
            required
            placeholder="Password lama"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={8}
            placeholder="Password baru (min. 8 karakter)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={savingPassword}
            className="self-start rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60"
          >
            {savingPassword ? "Menyimpan..." : "Ganti Password"}
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-bold text-ink">Verifikasi Dua Langkah (2FA)</h2>
          {status && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                status.enabled ? "bg-primary-subtle text-primary" : "bg-ink/5 text-muted"
              }`}
            >
              {status.enabled ? "Aktif" : "Nonaktif"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          Amankan akunmu dengan kode dari aplikasi authenticator (mis. Google Authenticator, Authy) setiap kali
          login.
        </p>

        {!status?.enabled && !setupSecret && (
          <button
            type="button"
            onClick={handleStart2FA}
            className="mt-3 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark"
          >
            Aktifkan 2FA
          </button>
        )}

        {setupSecret && (
          <div className="mt-4 rounded-xl border border-border bg-primary-subtle/40 p-4">
            <p className="text-xs text-muted">
              Scan kode QR ini di aplikasi authenticator-mu, lalu masukkan kode 6 digit yang muncul untuk konfirmasi.
            </p>
            <div className="mt-3 flex justify-center">
              <QRCodeCanvas value={setupSecret.otpauth_url} size={180} level="M" marginSize={2} />
            </div>
            <p className="mt-3 break-all text-center text-[11px] text-muted">
              Kode manual: <span className="font-mono font-semibold text-ink">{setupSecret.secret}</span>
            </p>

            <form onSubmit={handleVerify2FA} className="mt-4 flex flex-col gap-2">
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-center text-lg tracking-[0.3em] focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={verifying}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60"
              >
                {verifying ? "Memverifikasi..." : "Konfirmasi & Aktifkan"}
              </button>
            </form>
          </div>
        )}

        {status?.enabled && !showDisableForm && (
          <button
            type="button"
            onClick={() => setShowDisableForm(true)}
            className="mt-3 rounded-xl border border-red-200 px-5 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
          >
            Nonaktifkan 2FA
          </button>
        )}

        {showDisableForm && (
          <form onSubmit={handleDisable2FA} className="mt-3 flex flex-col gap-2 rounded-lg bg-red-50 p-3">
            <input
              type="password"
              required
              placeholder="Masukkan password untuk konfirmasi"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={disabling}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {disabling ? "Memproses..." : "Nonaktifkan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDisableForm(false);
                  setDisablePassword("");
                }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-ink"
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Sesi Aktif</h2>
        <p className="mt-1 text-xs text-muted">Device yang sedang login ke akunmu.</p>

        <div className="mt-3 flex flex-col gap-2">
          {sessions === null && <p className="text-xs text-muted">Memuat...</p>}
          {sessions?.length === 0 && <p className="text-xs text-muted">Tidak ada sesi aktif tercatat.</p>}
          {sessions?.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              {/* Bug ditemukan (5 Agustus 2026, audit responsif): badge
                  "Sesi ini" sebelumnya ikut ditulis SEBARIS di dalam <p>
                  yang sama dengan user_agent (bisa sangat panjang & tanpa
                  spasi) -- truncate saja tidak cukup tanpa flex-1 di
                  wrapper-nya, badge jadi terdorong keluar viewport alih-alih
                  ikut terpotong. Sekarang badge jadi SIBLING terpisah
                  (flex-shrink-0, selalu utuh terlihat), teks panjang yang
                  truncate di elemennya sendiri. */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate text-xs font-semibold text-ink">
                    {s.user_agent || "Device tidak dikenal"}
                  </p>
                  {s.is_current && (
                    <span className="flex-shrink-0 rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-bold text-primary">
                      Sesi ini
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  Masuk {new Date(s.created_at).toLocaleString("id-ID")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRevokeSession(s.id)}
                disabled={revokingId === s.id}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <IconTrash className="h-3 w-3" />
                Cabut
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
