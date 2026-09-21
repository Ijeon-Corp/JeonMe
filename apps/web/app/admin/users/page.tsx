"use client";

import { useEffect, useState } from "react";
import { AdminUser, ApiError, activateUser, listAdminUsers, suspendUser } from "@/lib/api-client";
import { confirmAction, confirmDelete } from "@/lib/confirm";
import { IconUsers } from "@/components/icons";
import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { useErrorToast } from "@/lib/use-error-toast";
import { useToast } from "@/components/Toast";

const PAGE_SIZE = 50;

// RoleBadge/StatusBadge -- audit UI/UX admin (17 September 2026): role
// sebelumnya teks abu-abu polos di bawah nama, gampang terlewat pas
// nyisir banyak baris padahal admin/support adalah info penting (perlu
// gampang dibedakan dari creator biasa). Warna semantik SENGAJA beda dari
// role: role = identitas (netral kecuali admin/support), status = kondisi
// akun (hijau/merah/abu sesuai baik/buruk).
function RoleBadge({ role }: { role: string }) {
  const style =
    role === "admin"
      ? "border-jeon-ink bg-jeon-lavender text-jeon-purple"
      : role === "support"
        ? "border-jeon-ink bg-blue-50 text-blue-700"
        : "border-app-border bg-app-surface-2 text-app-muted";
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${style}`}>{role}</span>;
}

function StatusBadge({ u }: { u: AdminUser }) {
  if (u.deleted_at) return <span className="inline-flex rounded-full border border-app-border bg-app-surface-2 px-2 py-0.5 text-[11px] font-bold text-app-muted">Dihapus</span>;
  if (u.suspended_at) return <span className="inline-flex rounded-full border border-jeon-ink bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">Ditangguhkan</span>;
  return <span className="inline-flex rounded-full border border-jeon-ink bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">Aktif</span>;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const { showToast } = useToast();
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
      showToast(isSuspending ? `@${u.username} ditangguhkan.` : `@${u.username} diaktifkan kembali.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status pengguna.");
    }
  }

  if (loading) return <p className="text-sm text-app-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Pengguna</h1>

      <form onSubmit={handleFilter} className="mt-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
        <input
          type="text"
          placeholder="Cari email/username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20 lg:min-w-[160px] lg:flex-1"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="bg-app-surface text-app-ink min-w-0 rounded-lg border border-app-border px-2.5 py-2.5 text-sm"
        >
          <option value="">Semua role</option>
          <option value="creator">Creator</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-app-surface text-app-ink min-w-0 rounded-lg border border-app-border px-2.5 py-2.5 text-sm"
        >
          <option value="">Semua status</option>
          <option value="active">Aktif</option>
          <option value="suspended">Ditangguhkan</option>
          <option value="deleted">Dihapus</option>
        </select>
        <button type="submit" className="flex-shrink-0 rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-semibold hover:border-jeon-purple">
          Cari
        </button>
      </form>


      <p className="mt-3 text-xs text-app-muted">
        Menampilkan {users.length} dari {total} pengguna.
      </p>

      {/* Tabel ringkas (audit UI/UX admin, 17 September 2026) --
          MENGGANTIKAN kartu penuh-border per baris sebelumnya: 24+
          pengguna jadi kartu bertumpuk borosin ruang vertikal & tidak
          scalable seiring jumlah pengguna bertambah -- pola sama yang
          sudah dipakai /admin/traffic-sources (tabel), disamakan di sini. */}
      <div className="mt-2 overflow-x-auto rounded-jmd border-2 border-jeon-ink bg-app-surface shadow-card">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-jeon-ink bg-app-surface-2 text-left text-[11px] font-bold uppercase tracking-wide text-app-muted">
              <th className="px-4 py-2.5 font-bold">Pengguna</th>
              <th className="px-4 py-2.5 font-bold">Role</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-border">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-app-surface-2/60">
                <td className="min-w-0 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                      <IconUsers className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-app-ink">{u.username}</p>
                      <p className="truncate text-xs text-app-muted">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge u={u} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!u.deleted_at && u.role !== "admin" && (
                    <button
                      type="button"
                      onClick={() => handleToggleSuspend(u)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                        u.suspended_at ? "bg-jeon-purple/10 text-jeon-purple" : "bg-red-50 text-red-600"
                      }`}
                    >
                      {u.suspended_at ? "Aktifkan" : "Tangguhkan"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <AdminEmptyState text="Tidak ada pengguna ditemukan." />}
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
