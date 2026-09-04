"use client";

import { useEffect, useState } from "react";
import { AdminUser, ApiError, activateUser, listAdminUsers, suspendUser } from "@/lib/api-client";
import { confirmAction, confirmDelete } from "@/lib/confirm";
import { IconInbox, IconUsers } from "@/components/icons";

const PAGE_SIZE = 50;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  function reload(offset = 0) {
    return listAdminUsers({ search, role: role || undefined, status: status || undefined, limit: PAGE_SIZE, offset }).then((res) => {
      setTotal(res.total);
      if (offset === 0) setUsers(res.items);
      else setUsers((prev) => [...prev, ...res.items]);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengguna."))
      .finally(() => setLoading(false));
    // Sengaja hanya sekali saat mount -- filter/search dipicu manual lewat
    // handleFilter, bukan otomatis tiap ketik/ganti pilihan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFilter(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await reload(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencari pengguna.");
    }
  }

  async function handleLoadMore() {
    setLoadingMore(true);
    setError(null);
    try {
      await reload(users.length);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat pengguna lainnya.");
    } finally {
      setLoadingMore(false);
    }
  }

  // handleToggleSuspend -- audit fitur admin (5 September 2026): sebelumnya
  // langsung eksekusi begitu diklik, tanpa jeda konfirmasi apa pun --
  // menangguhkan/mengaktifkan akun orang lain BUKAN aksi ringan, pola
  // confirmDelete/confirmAction sudah dipakai di seluruh dashboard utk
  // aksi sepenting ini.
  async function handleToggleSuspend(u: AdminUser) {
    const isSuspending = !u.suspended_at;
    const confirmed = isSuspending
      ? await confirmDelete(`Akun @${u.username} tidak akan bisa masuk sampai diaktifkan lagi. Lanjutkan menangguhkan?`, {
          title: "Tangguhkan pengguna?",
          confirmButtonText: "Ya, Tangguhkan",
        })
      : await confirmAction(`Akun @${u.username} akan bisa masuk lagi seperti biasa. Lanjutkan mengaktifkan?`, {
          title: "Aktifkan pengguna?",
          confirmButtonText: "Ya, Aktifkan",
        });
    if (!confirmed) return;

    setError(null);
    try {
      if (isSuspending) {
        await suspendUser(u.id);
      } else {
        await activateUser(u.id);
      }
      await reload(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status pengguna.");
    }
  }

  if (loading) return <p className="text-sm text-app-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Pengguna</h1>

      <form onSubmit={handleFilter} className="mt-4 flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Cari email/username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[160px] flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-app-border px-2.5 py-2.5 text-sm"
        >
          <option value="">Semua role</option>
          <option value="creator">Creator</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-app-border px-2.5 py-2.5 text-sm"
        >
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="suspended">Ditangguhkan</option>
          <option value="deleted">Dihapus</option>
        </select>
        <button type="submit" className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-semibold hover:border-jeon-purple">
          Cari
        </button>
      </form>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <p className="mt-3 text-xs text-app-muted">
        Menampilkan {users.length} dari {total} pengguna.
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-xl border-2 border-jeon-ink bg-app-surface px-4 py-3 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                <IconUsers className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-app-ink">
                  {u.username} <span className="font-normal text-app-muted">({u.email})</span>
                </p>
                <p className="text-xs text-app-muted">
                  {u.role}
                  {u.deleted_at && " · dihapus"}
                  {u.suspended_at && !u.deleted_at && " · ditangguhkan"}
                </p>
              </div>
            </div>
            {!u.deleted_at && u.role !== "admin" && (
              <button
                type="button"
                onClick={() => handleToggleSuspend(u)}
                className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold ${
                  u.suspended_at ? "bg-jeon-purple/10 text-jeon-purple" : "bg-red-50 text-red-600"
                }`}
              >
                {u.suspended_at ? "Aktifkan" : "Tangguhkan"}
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-surface/60 px-4 py-6 text-sm text-app-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            Tidak ada pengguna ditemukan.
          </div>
        )}
      </div>

      {users.length < total && (
        <button
          type="button"
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="mt-3 w-full rounded-lg border-2 border-jeon-ink py-2 text-sm font-semibold hover:border-jeon-purple disabled:opacity-50"
        >
          {loadingMore ? "Memuat..." : "Muat lebih"}
        </button>
      )}
    </div>
  );
}
