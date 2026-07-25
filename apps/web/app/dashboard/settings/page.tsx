"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, clearToken, deleteAccount } from "@/lib/api-client";

export default function DashboardSettingsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteAccount() {
    if (
      !window.confirm(
        "Yakin hapus akun? Halaman & produkmu akan dinonaktifkan dan datamu dianonimkan. Aksi ini tidak bisa dibatalkan."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount();
      clearToken();
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus akun.");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Pengaturan</h1>
      <p className="mt-1 text-sm text-muted">Kelola akunmu.</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-heading text-sm font-bold text-red-700">Zona Berbahaya</h2>
        <p className="mt-1 text-xs text-red-700/80">
          Menghapus akun akan menonaktifkan halaman & produkmu dan menganonimkan data pribadimu.
          Riwayat transaksi tetap disimpan untuk keperluan pembukuan.
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {deleting ? "Menghapus..." : "Hapus Akun"}
        </button>
      </section>
    </div>
  );
}
