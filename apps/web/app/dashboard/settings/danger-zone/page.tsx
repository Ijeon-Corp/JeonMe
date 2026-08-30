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
import { useLocale } from "@/lib/locale-context";

// Modul Settings §6. Perbaikan kunci dari kelemahan Lynk.id (dilaporkan
// bisa hapus akun dalam hitungan detik tanpa masa tunggu): hapus akun di
// sini TIDAK PERNAH instan -- masuk masa tunggu 14 hari (bisa dibatalkan
// kapan pun), beda dari nonaktifkan yang reversibel seketika.
export default function DangerZonePage() {
  const { t } = useLocale();
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
      showToast(t("dashboard.pages.settingsDangerZone.deactivateSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsDangerZone.deactivateError"), "error");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivate() {
    setReactivating(true);
    try {
      await reactivateAccount();
      await reload();
      showToast(t("dashboard.pages.settingsDangerZone.reactivateSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsDangerZone.reactivateError"), "error");
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
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsDangerZone.exportError"), "error");
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
      showToast(t("dashboard.pages.settingsDangerZone.requestDeletionSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsDangerZone.requestDeletionError"), "error");
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancelDeletion() {
    setCancelling(true);
    try {
      await cancelAccountDeletion();
      await reload();
      showToast(t("dashboard.pages.settingsDangerZone.cancelDeletionSuccess"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.settingsDangerZone.cancelDeletionError"), "error");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-jeon-purple"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {t("dashboard.pages.settingsDangerZone.breadcrumb")}
      </Link>

      <h1 className="mt-3 font-heading text-2xl font-bold text-app-ink">{t("dashboard.pages.settingsDangerZone.title")}</h1>
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.settingsDangerZone.subtitle")}</p>

      <section className="mt-6 rounded-3xl border border-app-border bg-app-surface p-5">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.pages.settingsDangerZone.deactivateTitle")}</h2>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.settingsDangerZone.deactivateDescription")}</p>

        {status?.deactivated ? (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-jeon-purple/10/50 px-3 py-2.5">
            <span className="text-xs font-semibold text-app-ink">{t("dashboard.pages.settingsDangerZone.currentlyDeactivated")}</span>
            <button
              type="button"
              onClick={handleReactivate}
              disabled={reactivating}
              className="rounded-lg bg-jeon-purple px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {reactivating ? t("dashboard.pages.settingsDangerZone.processing") : t("dashboard.pages.settingsDangerZone.reactivateButton")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeactivate} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              required
              placeholder={t("dashboard.pages.settingsDangerZone.enterPasswordPlaceholder")}
              value={deactivatePassword}
              onChange={(e) => setDeactivatePassword(e.target.value)}
              className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
            />
            <button
              type="submit"
              disabled={deactivating}
              className="rounded-lg border border-app-border px-4 py-2.5 text-sm font-bold text-app-ink hover:border-jeon-purple disabled:opacity-60"
            >
              {deactivating ? t("dashboard.pages.settingsDangerZone.processing") : t("dashboard.pages.settingsDangerZone.deactivateButton")}
            </button>
          </form>
        )}
      </section>

      <section className="mt-4 rounded-3xl border border-app-border bg-app-surface p-5">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.pages.settingsDangerZone.exportTitle")}</h2>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.settingsDangerZone.exportDescription")}</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="mt-3 rounded-lg border border-app-border px-4 py-2 text-xs font-bold text-app-ink hover:border-jeon-purple disabled:opacity-60"
        >
          {exporting ? t("dashboard.pages.settingsDangerZone.exportPreparing") : t("dashboard.pages.settingsDangerZone.exportButton")}
        </button>
      </section>

      <section className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-heading text-sm font-bold text-red-700">{t("dashboard.pages.settingsDangerZone.deleteTitle")}</h2>

        {status?.pending ? (
          <>
            <p className="mt-1 text-xs text-red-700/80">
              {t("dashboard.pages.settingsDangerZone.pendingDeletionPrefix")}{" "}
              <strong>
                {status.scheduled_purge_at && new Date(status.scheduled_purge_at).toLocaleString("id-ID")}
              </strong>
              . {t("dashboard.pages.settingsDangerZone.pendingDeletionSuffix")}
            </p>
            <button
              type="button"
              onClick={handleCancelDeletion}
              disabled={cancelling}
              className="mt-3 rounded-lg bg-app-surface px-4 py-2 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-100 disabled:opacity-60"
            >
              {cancelling ? t("dashboard.pages.settingsDangerZone.processing") : t("dashboard.pages.settingsDangerZone.cancelDeletionButton")}
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-red-700/80">{t("dashboard.pages.settingsDangerZone.deleteWarning")}</p>
            <form onSubmit={handleRequestDeletion} className="mt-3 flex flex-col gap-2">
              <input
                type="text"
                required
                placeholder={t("dashboard.pages.settingsDangerZone.usernameConfirmPlaceholder")}
                value={usernameConfirmation}
                onChange={(e) => setUsernameConfirmation(e.target.value)}
                className="rounded-lg border border-red-200 bg-app-surface px-3.5 py-2.5 text-sm focus:border-red-400 focus:outline-none"
              />
              <input
                type="password"
                required
                placeholder={t("dashboard.pages.settingsDangerZone.passwordPlaceholder")}
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="rounded-lg border border-red-200 bg-app-surface px-3.5 py-2.5 text-sm focus:border-red-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={requesting}
                className="self-start rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {requesting ? t("dashboard.pages.settingsDangerZone.processing") : t("dashboard.pages.settingsDangerZone.requestDeletionButton")}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
