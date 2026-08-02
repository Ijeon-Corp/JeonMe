"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AccountDeletionStatus,
  ApiError,
  cancelAccountDeletion,
  deactivateAccount,
  exportAccountData,
  getAccountDeletionStatus,
  reactivateAccount,
  requestAccountDeletion,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconChevronRight } from "@/components/icons";

// Modul Settings §6. Perbaikan kunci dari kelemahan Lynk.id (dilaporkan
// bisa hapus akun dalam hitungan detik tanpa masa tunggu): hapus akun di
// sini TIDAK PERNAH instan -- masuk masa tunggu 14 hari (bisa dibatalkan
// kapan pun), beda dari nonaktifkan yang reversibel seketika.
export default function DangerZonePage() {
  const { showToast } = useToast();

  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);

  const [deactivatePassword, setDeactivatePassword] = useState("");
  const [deactivating, setDeactivating] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [usernameConfirmation, setUsernameConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function reload() {
    return getAccountDeletionStatus().then(setStatus);
  }

  useEffect(() => {
    reload().catch(() => {
      // Non-fatal -- bagian lain halaman tetap bisa dipakai.
    });
  }, []);

  async function handleDeactivate(e: React.FormEvent) {
    e.preventDefault();
    setDeactivating(true);
    try {
      await deactivateAccount(deactivatePassword);
      setDeactivatePassword("");
      await reload();
      showToast("Akun dinonaktifkan, halaman publikmu tidak lagi tampil.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menonaktifkan akun.", "error");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivate() {
    setReactivating(true);
    try {
      await reactivateAccount();
      await reload();
      showToast("Akun diaktifkan kembali.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal mengaktifkan kembali akun.", "error");
    } finally {
      setReactivating(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { download_url } = await exportAccountData();
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal membuat data ekspor.", "error");
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestDeletion(e: React.FormEvent) {
    e.preventDefault();
    setRequesting(true);
    try {
      await requestAccountDeletion({ username_confirmation: usernameConfirmation, password: deletePassword });
      setUsernameConfirmation("");
      setDeletePassword("");
      await reload();
      showToast("Penghapusan akun dijadwalkan 14 hari lagi. Bisa dibatalkan kapan saja sebelum itu.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menjadwalkan penghapusan akun.", "error");
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancelDeletion() {
    setCancelling(true);
    try {
      await cancelAccountDeletion();
      await reload();
      showToast("Penghapusan akun dibatalkan.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal membatalkan penghapusan.", "error");
    } finally {
      setCancelling(false);
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

      <h1 className="mt-3 font-heading text-2xl font-bold text-ink">Zona Berbahaya</h1>
      <p className="mt-1 text-sm text-muted">Nonaktifkan atau hapus akunmu, dan unduh data pribadimu.</p>

      <section className="mt-6 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Nonaktifkan Akun</h2>
        <p className="mt-1 text-xs text-muted">
          Halaman publikmu langsung tidak tampil, tapi semua data & pengaturanmu tetap utuh. Bisa diaktifkan
          kembali kapan pun.
        </p>

        {status?.deactivated ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-primary-subtle/50 px-3 py-2.5">
            <span className="text-xs font-semibold text-ink">Akunmu sedang nonaktif.</span>
            <button
              type="button"
              onClick={handleReactivate}
              disabled={reactivating}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {reactivating ? "Memproses..." : "Aktifkan Kembali"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeactivate} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              required
              placeholder="Masukkan password"
              value={deactivatePassword}
              onChange={(e) => setDeactivatePassword(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={deactivating}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-ink hover:border-primary disabled:opacity-60"
            >
              {deactivating ? "Memproses..." : "Nonaktifkan"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5">
        <h2 className="font-heading text-sm font-bold text-ink">Ekspor Data</h2>
        <p className="mt-1 text-xs text-muted">
          Unduh salinan data produk, histori transaksi, dan daftar pelanggan sebelum menghapus akun.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="mt-3 rounded-lg border border-border px-4 py-2 text-xs font-bold text-ink hover:border-primary disabled:opacity-60"
        >
          {exporting ? "Menyiapkan..." : "Unduh Data Saya"}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-heading text-sm font-bold text-red-700">Hapus Akun</h2>

        {status?.pending ? (
          <>
            <p className="mt-1 text-xs text-red-700/80">
              Akunmu dijadwalkan dihapus permanen pada{" "}
              <strong>
                {status.scheduled_purge_at && new Date(status.scheduled_purge_at).toLocaleString("id-ID")}
              </strong>
              . Data belum hilang -- kamu bisa membatalkan kapan pun sebelum tanggal itu.
            </p>
            <button
              type="button"
              onClick={handleCancelDeletion}
              disabled={cancelling}
              className="mt-3 rounded-lg bg-white px-4 py-2 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-100 disabled:opacity-60"
            >
              {cancelling ? "Memproses..." : "Batalkan Penghapusan"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-red-700/80">
              Akun masuk masa tunggu 14 hari sebelum benar-benar dihapus & dianonimkan secara permanen -- bisa
              dibatalkan kapan pun sebelum itu. Riwayat transaksi tetap disimpan untuk keperluan pembukuan.
            </p>
            <form onSubmit={handleRequestDeletion} className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                required
                placeholder="Ketik username-mu untuk konfirmasi"
                value={usernameConfirmation}
                onChange={(e) => setUsernameConfirmation(e.target.value)}
                className="rounded-lg border border-red-200 bg-white px-3.5 py-2.5 text-sm focus:border-red-400 focus:outline-none"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="rounded-lg border border-red-200 bg-white px-3.5 py-2.5 text-sm focus:border-red-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={requesting}
                className="self-start rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {requesting ? "Memproses..." : "Ajukan Penghapusan Akun"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
