"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, StorageFileItem, deleteProductFile, listStorage } from "@/lib/api-client";
import { IconInbox, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";

// Modul Toko (Fase E3): tab Storage & Files -- daftar file produk + total
// penyimpanan terpakai. file_size_bytes bisa null (file lama sebelum
// migrasi 000051) -- ditampilkan jujur sebagai "?", bukan 0.
// formatBytes -- menerima t() sebagai parameter (bukan lagi mengandalkan
// hook langsung) karena fungsi ini modul-level, dipanggil dari dalam
// komponen yang sudah punya akses ke t().
function formatBytes(bytes: number | null, t: (key: string) => string): string {
  if (bytes === null) return t("dashboard.components.storageFilesPanel.unknownSize");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageFilesPanel() {
  const { t } = useLocale();
  const [data, setData] = useState<{ files: StorageFileItem[]; total_bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listStorage()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.storageFilesPanel.loadError")));
  }, [t]);

  async function handleDelete(item: StorageFileItem) {
    const confirmText = t("dashboard.components.storageFilesPanel.confirmDeleteText").replace("{name}", item.product_name);
    if (!(await confirmDelete(confirmText))) return;
    setDeletingId(item.product_id);
    try {
      await deleteProductFile(item.product_id);
      setData((prev) => (prev ? { files: prev.files.filter((f) => f.product_id !== item.product_id), total_bytes: prev.total_bytes - (item.file_size_bytes ?? 0) } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.storageFilesPanel.deleteError"));
    } finally {
      setDeletingId(null);
    }
  }

  if (data === null) {
    return <PageSkeleton />;
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mb-3 rounded-2xl p-4 shadow-card">
        <p className="text-xs font-semibold text-app-muted">{t("dashboard.components.storageFilesPanel.totalStorageLabel")}</p>
        <p className="mt-1 font-heading text-xl font-bold text-app-ink">{formatBytes(data.total_bytes, t)}</p>
      </div>

      <div className="glass overflow-x-auto rounded-2xl shadow-card">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-app-border text-[11px] font-semibold uppercase tracking-wide text-app-muted">
              <th className="px-4 py-3">{t("dashboard.components.storageFilesPanel.columnProduct")}</th>
              <th className="px-4 py-3">{t("dashboard.components.storageFilesPanel.columnSize")}</th>
              <th className="px-4 py-3">{t("dashboard.components.storageFilesPanel.columnStatus")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.files.map((f) => (
              <tr key={f.product_id} className="border-b border-app-border last:border-0">
                <td className="px-4 py-3 font-semibold text-app-ink">{f.product_name}</td>
                <td className="px-4 py-3 text-app-ink">{formatBytes(f.file_size_bytes, t)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      f.is_active ? "bg-jeon-purple/10 text-jeon-purple" : "bg-gray-100 text-app-muted"
                    }`}
                  >
                    {f.is_active
                      ? t("dashboard.components.storageFilesPanel.statusActive")
                      : t("dashboard.components.storageFilesPanel.statusInactive")}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={deletingId === f.product_id}
                    onClick={() => handleDelete(f)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
                    title={t("dashboard.components.storageFilesPanel.deleteTitle")}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.files.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <IconInbox className="h-5 w-5 text-app-muted" />
            <p className="text-xs text-app-muted">{t("dashboard.components.storageFilesPanel.emptyState")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
