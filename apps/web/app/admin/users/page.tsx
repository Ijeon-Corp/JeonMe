"use client";

import { useEffect, useState } from "react";
import { AdminUser, ApiError, activateUser, listAdminUsers, suspendUser } from "@/lib/api-client";
import { IconInbox, IconUsers } from "@/components/icons";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function reload(q?: string) {
    return listAdminUsers(q).then(setUsers);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengguna."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await reload(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencari pengguna.");
    }
  }

  async function handleToggleSuspend(u: AdminUser) {
    setError(null);
    try {
      if (u.suspended_at) {
        await activateUser(u.id);
      } else {
        await suspendUser(u.id);
      }
      await reload(search);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status pengguna.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Pengguna</h1>

      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <input
          type="text"
          placeholder="Cari email/username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button type="submit" className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:border-primary">
          Cari
        </button>
      </form>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-col gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 shadow-card">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <IconUsers className="h-[18px] w-[18px]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {u.username} <span className="font-normal text-muted">({u.email})</span>
                </p>
                <p className="text-xs text-muted">
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
                  u.suspended_at ? "bg-secondary-subtle text-secondary-dark" : "bg-red-50 text-red-600"
                }`}
              >
                {u.suspended_at ? "Aktifkan" : "Tangguhkan"}
              </button>
            )}
          </div>
        ))}
        {users.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-sm text-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            Tidak ada pengguna ditemukan.
          </div>
        )}
      </div>
    </div>
  );
}
