"use client";

import { useEffect, useState } from "react";
import { ApiError, StorageFileItem, deleteProductFile, listStorage } from "@/lib/api-client";
import { IconInbox, IconTrash } from "@/components/icons";
import { confirmDelete } from "@/lib/confirm";

// Modul Toko (Fase E3): tab Storage & Files -- daftar file produk + total
// penyimpanan terpakai. file_size_bytes bisa null (file lama sebelum
// migrasi 000051) -- ditampilkan jujur sebagai "?", bukan 0.
function formatBytes(bytes: number | null): string {
  if (bytes === null) return "Ukuran tidak diketahui";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StorageFilesPanel() {
  const [data, setData] = useState<{ files: StorageFileItem[]; total_bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listStorage()
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data penyimpanan."));
  }, []);

  async function handleDelete(item: StorageFileItem) {
    if (!(await confirmDelete(`Hapus file "${item.product_name}"? Produk akan dinonaktifkan sampai file baru diunggah.`))) return;
    setDeletingId(item.product_id);
    try {
      await deleteProductFile(item.product_id);
      setData((prev) => (prev ? { files: prev.files.filter((f) => f.product_id !== item.product_id), total_bytes: prev.total_bytes - (item.file_size_bytes ?? 0) } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus file.");
    } finally {
      setDeletingId(null);
    }
  }

  if (data === null) {
    return <p className="mt-4 text-sm text-muted">Memuat...</p>;
  }

  return (
    <div className="mt-4">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mb-3 rounded-2xl border border-border bg-white p-4 shadow-card">
        <p className="text-xs font-semibold text-muted">Total Penyimpanan Terpakai</p>
        <p className="mt-1 font-heading text-xl font-bold text-ink">{formatBytes(data.total_bytes)}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-card">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Produk</th>
              <th className="px-4 py-3">Ukuran</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {data.files.map((f) => (
              <tr key={f.product_id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-semibold text-ink">{f.product_name}</td>
                <td className="px-4 py-3 text-ink">{formatBytes(f.file_size_bytes)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      f.is_active ? "bg-secondary-subtle text-secondary-dark" : "bg-gray-100 text-muted"
                    }`}
                  >
                    {f.is_active ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={deletingId === f.product_id}
                    onClick={() => handleDelete(f)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
                    title="Hapus file"
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
            <IconInbox className="h-5 w-5 text-muted" />
            <p className="text-xs text-muted">Belum ada file yang diunggah.</p>
          </div>
        )}
      </div>
    </div>
  );
}
