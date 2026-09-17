"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardCollaborator,
  PendingCollaborationInvite,
  TeamAuditLogEntry,
  TeamRole,
  Workspace,
  acceptCollaborationInvite,
  inviteCollaborator,
  listCollaborators,
  listInvitesForMe,
  listTeamAuditLog,
  listWorkspaces,
  revokeCollaborator,
  setActiveWorkspaceOwnerId,
  updateCollaboratorRole,
} from "@/lib/api-client";
import { useToast } from "@/components/Toast";
import { IconCheck, IconChevronRight, IconClock, IconTrash, IconUsers } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
import { useErrorToast } from "@/lib/use-error-toast";

function buildStatusLabel(t: (key: string) => string): Record<DashboardCollaborator["status"], string> {
  return {
    invited: t("dashboard.pages.team.status.invited"),
    active: t("dashboard.pages.team.status.active"),
    revoked: t("dashboard.pages.team.status.revoked"),
  };
}

// Modul Settings §4 (keputusan pengguna 2026-07-31): role dipetakan ke 3
// flag boolean lama di backend (roleToPermissions) -- daftar & label di
// sini HARUS tetap sinkron dengan pemetaan itu.
function buildRoleLabel(t: (key: string) => string): Record<TeamRole, string> {
  return {
    content_admin: t("dashboard.pages.team.role.contentAdmin"),
    sales_admin: t("dashboard.pages.team.role.salesAdmin"),
    full_access: t("dashboard.pages.team.role.fullAccess"),
  };
}
const ROLE_OPTIONS: TeamRole[] = ["content_admin", "sales_admin", "full_access"];

function formatAuditEntry(entry: TeamAuditLogEntry, t: (key: string) => string, roleLabel: Record<TeamRole, string>): string {
  const m = entry.metadata ?? {};
  const email = m.collaborator_email ?? t("dashboard.pages.team.someoneFallback");
  switch (entry.action) {
    case "team.invited":
      return t("dashboard.pages.team.auditInvited")
        .replace("{email}", email)
        .replace("{role}", roleLabel[m.role as TeamRole] ?? m.role);
    case "team.role_updated":
      return t("dashboard.pages.team.auditRoleUpdated")
        .replace("{email}", email)
        .replace("{oldRole}", roleLabel[m.old_role as TeamRole] ?? m.old_role)
        .replace("{newRole}", roleLabel[m.new_role as TeamRole] ?? m.new_role);
    case "team.revoked":
      return t("dashboard.pages.team.auditRevoked")
        .replace("{email}", email)
        .replace("{role}", roleLabel[m.role as TeamRole] ?? m.role);
    case "team.invite_accepted":
      return t("dashboard.pages.team.auditInviteAccepted").replace("{email}", email);
    default:
      return entry.action;
  }
}

export default function DashboardTeamPage() {
  const { showToast } = useToast();
  const { t } = useLocale();
  // Tab Anggota|Undangan|Aktivitas + deskripsi capability di bawah
  // pilihan peran (SPEC §19, Phase 7). LENGKAP & stabil di production
  // sejak v0.37.0/v0.38.0, flag "settings" dihapus dari file ini 8
  // September 2026.
  const [teamTab, setTeamTab] = useState<"members" | "invites" | "activity">("members");
  const STATUS_LABEL = buildStatusLabel(t);
  const ROLE_LABEL = buildRoleLabel(t);

  const [collaborators, setCollaborators] = useState<DashboardCollaborator[]>([]);
  const [invitesForMe, setInvitesForMe] = useState<PendingCollaborationInvite[]>([]);
  const [auditLog, setAuditLog] = useState<TeamAuditLogEntry[]>([]);
  // workspaces -- permintaan langsung pengguna, 12 September 2026
  // ("masih tidak tau alur member... setelah accept dimana bisa edit
  // semua link tim nya"): SEBELUMNYA satu-satunya tempat melihat "akun
  // mana saja yang bisa aku kelola" adalah dropdown kecil "Kelola
  // sebagai" di sidebar (gampang terlewat) -- sekarang ditampilkan
  // LANGSUNG di halaman ini juga (lihat section "Akun yang Bisa Kamu
  // Kelola" di bawah), tepat di tempat undangan diterima.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busyId, setBusyId] = useState<string | null>(null);
  const managedWorkspaces = workspaces.filter((w) => !w.is_self);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [role, setRole] = useState<TeamRole>("content_admin");
  const [inviting, setInviting] = useState(false);

  function reload() {
    return Promise.all([listCollaborators(), listInvitesForMe(), listTeamAuditLog(), listWorkspaces()]).then(([c, i, a, w]) => {
      setCollaborators(c);
      setInvitesForMe(i);
      setAuditLog(a);
      setWorkspaces(w);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.team.loadError")))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOrUsername.trim()) {
      showToast(t("dashboard.pages.team.emailRequiredError"), "error");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await inviteCollaborator({ email_or_username: emailOrUsername.trim(), role });
      setEmailOrUsername("");
      setRole("content_admin");
      await reload();
      showToast(t("dashboard.pages.team.inviteSentToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.team.inviteError"), "error");
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
      showToast(t("dashboard.pages.team.roleUpdatedToast").replace("{email}", collaborator.email));
      const auditRefresh = await listTeamAuditLog();
      setAuditLog(auditRefresh);
    } catch (err) {
      setCollaborators(previous);
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.team.roleUpdateError"), "error");
    }
  }

  async function handleRevoke(c: DashboardCollaborator) {
    if (!(await confirmDelete(t("dashboard.pages.team.revokeConfirmText").replace("{email}", c.email), { confirmButtonText: t("dashboard.pages.team.revokeConfirmButton") }))) return;
    setError(null);
    setBusyId(c.id);
    try {
      await revokeCollaborator(c.id);
      await reload();
      showToast(t("dashboard.pages.team.revokedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.team.revokeError"), "error");
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
      // Loncat OTOMATIS ke tab "Anggota" -- di situlah section "Akun
      // yang Bisa Kamu Kelola" (di bawah) muncul, alur paling langsung
      // dari "terima undangan" ke "tahu ke mana harus pergi" tanpa perlu
      // menjelaskan lewat toast/teks sama sekali.
      setTeamTab("members");
      showToast(t("dashboard.pages.team.inviteAcceptedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.team.acceptError"), "error");
    } finally {
      setBusyId(null);
    }
  }

  // handleManageNow -- tombol "Kelola Sekarang" di section "Akun yang
  // Bisa Kamu Kelola": ganti ruang kerja aktif LALU navigasi LANGSUNG ke
  // /dashboard/links (bukan cuma reload di tempat seperti sidebar) --
  // menjawab persis "setelah accept dimana bisa edit semua link tim
  // nya". window.location.href (BUKAN router.push) SENGAJA -- pola sama
  // seperti handleWorkspaceChange (dashboard/layout.tsx): banyak halaman
  // dashboard fetch datanya SEKALI saat mount, ganti ruang kerja lewat
  // navigasi client-side biasa akan meninggalkan data BASI dari ruang
  // kerja sebelumnya di halaman manapun yang sudah pernah dibuka sesi
  // ini.
  function handleManageNow(ws: Workspace) {
    setActiveWorkspaceOwnerId(ws.owner_user_id);
    // False positive dikonfirmasi lewat reproduksi terisolasi: rule
    // react-hooks/immutability SALAH menandai `window.location.href = ...`
    // sebagai "modifikasi variabel di luar komponen" HANYA kalau fungsi
    // pemanggilnya (di sini: handleManageNow) dipanggil dari dalam
    // `.map()` JSX (lihat onClick={() => handleManageNow(ws)} di bawah) --
    // assignment identik di luar konteks .map() (mis. handleCheckout,
    // settings/subscription/page.tsx) TIDAK kena rule ini sama sekali.
    // Pola window.location.href = string SUDAH established & aman dipakai
    // di banyak tempat lain di codebase ini (BuyProductButton.tsx, OAuth
    // button components, dst).
    // eslint-disable-next-line react-hooks/immutability
    window.location.href = "/dashboard/links";
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t("dashboard.nav.membersRoles")} description={t("dashboard.pages.team.intro")} />
      <div className="mb-5 flex items-center gap-1 border-b border-app-border pb-px">
        {([
          { key: "members" as const, label: t("dashboard.pages.team.tabMembers") },
          { key: "invites" as const, label: t("dashboard.pages.team.tabInvites") },
          { key: "activity" as const, label: t("dashboard.pages.team.tabActivity") },
        ]).map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={teamTab === tb.key}
            onClick={() => setTeamTab(tb.key)}
            className={`relative whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
              teamTab === tb.key ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
            }`}
          >
            {tb.label}
            {teamTab === tb.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-jeon-purple" aria-hidden="true" />}
          </button>
        ))}
      </div>


      {teamTab === "invites" && invitesForMe.length > 0 && (
        <section className="mt-4 rounded-jlg border border-jeon-purple/30 bg-jeon-purple/5 p-5">
          <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.team.invitesForMeHeading")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {invitesForMe.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border-2 border-jeon-ink bg-app-surface px-3.5 py-2.5">
                <div>
                  <p className="text-sm font-semibold text-app-ink">@{inv.owner_username}</p>
                  <p className="text-[11px] text-app-muted">{ROLE_LABEL[inv.role]}</p>
                </div>
                <button
                  type="button"
                  disabled={busyId === inv.id}
                  onClick={() => handleAccept(inv)}
                  className="btn-primary flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
                >
                  <IconCheck className="h-3.5 w-3.5" />
                  {t("dashboard.pages.team.acceptButton")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teamTab === "invites" && (
      <section className="glass mt-4 rounded-jlg p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.team.inviteHeading")}</h2>
        <form onSubmit={handleInvite} className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            placeholder={t("dashboard.pages.team.invitePlaceholder")}
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            className="rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <select
            aria-label={t("dashboard.pages.team.newRoleAriaLabel")}
            value={role}
            onChange={(e) => setRole(e.target.value as TeamRole)}
            className="bg-app-surface text-app-ink rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="rounded-lg bg-jeon-purple/5 px-3 py-2 text-[11px] text-app-muted">
            {t(`dashboard.pages.team.roleDesc.${role === "content_admin" ? "contentAdmin" : role === "sales_admin" ? "salesAdmin" : "fullAccess"}`)}
          </p>
          <button
            type="submit"
            disabled={inviting}
            className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {inviting ? t("dashboard.pages.team.invitingButton") : t("dashboard.pages.team.sendInviteButton")}
          </button>
        </form>
      </section>
      )}

      {/* "Akun yang Bisa Kamu Kelola" -- permintaan langsung pengguna, 12
          September 2026 ("masih tidak tau alur member... setelah accept
          dimana bisa edit semua link tim nya"): daftar akun ORANG LAIN
          yang pengguna ini bantu kelola (kebalikan "Kolaboratorku" di
          bawah, yang isinya orang lain yang membantu PENGGUNA INI).
          SEBELUMNYA info ini cuma ada di dropdown kecil sidebar "Kelola
          sebagai" -- sekarang tampil LANGSUNG di sini, tab yang otomatis
          terbuka begitu undangan diterima (lihat handleAccept), dengan
          tombol aksi langsung (handleManageNow) alih-alih cuma
          penjelasan teks ke tempat lain. Section ini SENGAJA di ATAS
          "Kolaboratorku" -- lebih mendesak begitu baru menerima undangan. */}
      {teamTab === "members" && managedWorkspaces.length > 0 && (
        <section className="mt-4 rounded-jlg border-2 border-jeon-purple bg-jeon-purple/5 p-5">
          <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.team.managedWorkspacesHeading")}</h2>
          <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.team.managedWorkspacesDesc")}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {managedWorkspaces.map((ws) => (
              <li
                key={ws.owner_user_id}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-jeon-ink bg-app-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-app-ink">@{ws.owner_username}</p>
                  <p className="text-[11px] text-app-muted">{ROLE_LABEL[ws.role as TeamRole] ?? ws.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleManageNow(ws)}
                  className="btn-primary flex flex-shrink-0 items-center gap-1 rounded-lg px-3.5 py-2 text-xs font-bold text-white"
                >
                  {t("dashboard.pages.team.manageNowButton")}
                  <IconChevronRight className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teamTab === "members" && (
      <section className="glass mt-4 rounded-jlg p-5 shadow-card">
        <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.team.myCollaboratorsHeading")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-app-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-jmd border-2 border-[#111111] bg-jeon-lavender text-[#111111]">
                  <IconUsers className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-ink">{c.email}</p>
                  <p className="text-[11px] text-app-muted">{STATUS_LABEL[c.status]}</p>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <select
                  aria-label={t("dashboard.pages.team.roleAriaLabelTemplate").replace("{email}", c.email)}
                  value={c.role}
                  onChange={(e) => handleRoleChange(c, e.target.value as TeamRole)}
                  disabled={c.status === "revoked"}
                  className="bg-app-surface text-app-ink rounded-lg border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none disabled:opacity-60"
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
                  title={t("dashboard.pages.team.revokeTitle")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {collaborators.length === 0 && <EmptyState as="li" text={t("dashboard.pages.team.emptyCollaborators")} />}
        </ul>
      </section>
      )}

      {teamTab === "activity" && (
      <section className="glass mt-4 rounded-jlg p-5 shadow-card">
        <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-app-ink">
          <IconClock className="h-4 w-4 text-app-muted" />
          {t("dashboard.pages.team.activityLogHeading")}
        </h2>
        <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.team.activityLogDesc")}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {auditLog.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-app-border px-3.5 py-2.5">
              <p className="text-xs text-app-ink">{formatAuditEntry(entry, t, ROLE_LABEL)}</p>
              <p className="mt-0.5 text-[11px] text-app-muted">{new Date(entry.created_at).toLocaleString("id-ID")}</p>
            </li>
          ))}
          {auditLog.length === 0 && <EmptyState as="li" text={t("dashboard.pages.team.emptyActivityLog")} />}
        </ul>
      </section>
      )}
    </div>
  );
}
