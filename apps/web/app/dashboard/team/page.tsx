"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardCollaborator,
  PendingCollaborationInvite,
  TeamAuditLogEntry,
  TeamRole,
  acceptCollaborationInvite,
  inviteCollaborator,
  listCollaborators,
  listInvitesForMe,
  listTeamAuditLog,
  revokeCollaborator,
  updateCollaboratorRole,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconClock, IconTrash, IconUsers } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { confirmDelete } from "@/lib/confirm";

const STATUS_LABEL: Record<DashboardCollaborator["status"], string> = {
  invited: "Menunggu diterima",
  active: "Aktif",
  revoked: "Dicabut",
};

// Modul Settings §4 (keputusan pengguna 2026-07-31): role dipetakan ke 3
// flag boolean lama di backend (roleToPermissions) -- daftar & label di
// sini HARUS tetap sinkron dengan pemetaan itu.
const ROLE_LABEL: Record<TeamRole, string> = {
  content_admin: "Admin Konten (Tautan & Desain)",
  sales_admin: "Admin Penjualan (Produk)",
  full_access: "Akses Penuh",
};
const ROLE_OPTIONS: TeamRole[] = ["content_admin", "sales_admin", "full_access"];

function formatAuditEntry(entry: TeamAuditLogEntry): string {
  const m = entry.metadata ?? {};
  const email = m.collaborator_email ?? "seseorang";
  switch (entry.action) {
    case "team.invited":
      return `Mengundang ${email} sebagai ${ROLE_LABEL[m.role as TeamRole] ?? m.role}`;
    case "team.role_updated":
      return `Mengubah role ${email} dari ${ROLE_LABEL[m.old_role as TeamRole] ?? m.old_role} ke ${
        ROLE_LABEL[m.new_role as TeamRole] ?? m.new_role
      }`;
    case "team.revoked":
      return `Mencabut akses ${email} (sebelumnya ${ROLE_LABEL[m.role as TeamRole] ?? m.role})`;
    case "team.invite_accepted":
      return `${email} menerima undangan`;
    default:
      return entry.action;
  }
}

export default function DashboardTeamPage() {
  const { showToast } = useToast();

  const [collaborators, setCollaborators] = useState<DashboardCollaborator[]>([]);
  const [invitesForMe, setInvitesForMe] = useState<PendingCollaborationInvite[]>([]);
  const [auditLog, setAuditLog] = useState<TeamAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("content_admin");
  const [inviting, setInviting] = useState(false);

  function reload() {
    return Promise.all([listCollaborators(), listInvitesForMe(), listTeamAuditLog()]).then(([c, i, a]) => {
      setCollaborators(c);
      setInvitesForMe(i);
      setAuditLog(a);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data tim."))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOrUsername.trim()) {
      showToast("Isi email atau username kolaborator.", "error");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await inviteCollaborator({ email_or_username: emailOrUsername.trim(), role });
      setEmailOrUsername("");
      setRole("content_admin");
      await reload();
      showToast("Undangan dikirim.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal membuat undangan.", "error");
    } finally {
      setInviting(false);
    }
  }

  // Optimistic UI + rollback (requirement UI wajib Modul Settings).
  async function handleRoleChange(collaborator: DashboardCollaborator, newRole: TeamRole) {
    const previous = collaborators;
    setCollaborators(collaborators.map((c) => (c.id === collaborator.id ? { ...c, role: newRole } : c)));
    try {
      await updateCollaboratorRole(collaborator.id, newRole);
      showToast(`Role ${collaborator.email} diperbarui.`);
      const auditRefresh = await listTeamAuditLog();
      setAuditLog(auditRefresh);
    } catch (err) {
      setCollaborators(previous);
      showToast(err instanceof ApiError ? err.message : "Gagal mengubah role.", "error");
    }
  }

  async function handleRevoke(c: DashboardCollaborator) {
    if (!(await confirmDelete(`Cabut akses "${c.email}"?`, { confirmButtonText: "Ya, Cabut" }))) return;
    setError(null);
    setBusyId(c.id);
    try {
      await revokeCollaborator(c.id);
      await reload();
      showToast("Akses kolaborator dicabut.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal mencabut akses.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAccept(invite: PendingCollaborationInvite) {
    setError(null);
    setBusyId(invite.id);
    try {
      await acceptCollaborationInvite(invite.id);
      await reload();
      showToast("Undangan diterima.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Gagal menerima undangan.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-muted">
        Undang admin/tim kecil untuk membantu kelola tautan, produk, atau desain halamanmu -- mereka TIDAK
        bisa menyentuh saldo, penarikan, verifikasi KYC, atau menghapus akunmu.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {invitesForMe.length > 0 && (
        <section className="mt-4 rounded-2xl border border-primary/30 bg-primary-subtle/40 p-5">
          <h2 className="font-heading text-sm font-bold text-ink">Undangan untuk Saya</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {invitesForMe.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-ink">@{inv.owner_username}</p>
                  <p className="text-[11px] text-muted">{ROLE_LABEL[inv.role]}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === inv.id}
                  onClick={() => handleAccept(inv)}
                  className="btn-primary flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  Terima
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <h2 className="font-heading text-sm font-bold text-ink">Undang Kolaborator</h2>
        <form onSubmit={handleInvite} className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            placeholder="email@contoh.com atau username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <select
            aria-label="Role kolaborator baru"
            value={role}
            onChange={(e) => setRole(e.target.value as TeamRole)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {inviting ? "Mengundang..." : "Kirim Undangan"}
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <h2 className="font-heading text-sm font-bold text-ink">Kolaboratorku</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <IconUsers className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{c.email}</p>
                  <p className="text-[11px] text-muted">{STATUS_LABEL[c.status]}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <select
                  aria-label={`Role ${c.email}`}
                  value={c.role}
                  onChange={(e) => handleRoleChange(c, e.target.value as TeamRole)}
                  disabled={c.status === "revoked"}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => handleRevoke(c)}
                  title="Cabut akses"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {collaborators.length === 0 && <EmptyState as="li" text="Belum ada kolaborator." />}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-ink">
          <IconClock className="h-4 w-4 text-muted" />
          Riwayat Aktivitas Tim
        </h2>
        <p className="mt-1 text-xs text-muted">Siapa mengubah apa dan kapan.</p>
        <ul className="mt-3 flex flex-col gap-2">
          {auditLog.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-border px-3.5 py-2.5">
              <p className="text-xs text-ink">{formatAuditEntry(entry)}</p>
              <p className="mt-0.5 text-[11px] text-muted">{new Date(entry.created_at).toLocaleString("id-ID")}</p>
            </li>
          ))}
          {auditLog.length === 0 && <EmptyState as="li" text="Belum ada aktivitas tim." />}
        </ul>
      </section>
    </div>
  );
}
