"use client";

import PageSkeleton from "@/components/Skeleton";
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
import { useLocale } from "@/lib/locale-context";

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
  const STATUS_LABEL = buildStatusLabel(t);
  const ROLE_LABEL = buildRoleLabel(t);

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
      showToast(t("dashboard.pages.team.inviteAcceptedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("dashboard.pages.team.acceptError"), "error");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.team.intro")}</p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {invitesForMe.length > 0 && (
        <section className="mt-4 rounded-3xl border border-jeon-purple/30 bg-jeon-purple/10/40 p-5">
          <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.pages.team.invitesForMeHeading")}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {invitesForMe.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between rounded-lg border border-app-border bg-app-surface px-3.5 py-2.5">
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

      <section className="glass mt-4 rounded-3xl p-5 shadow-card">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.pages.team.inviteHeading")}</h2>
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
            className="rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none"
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
            {inviting ? t("dashboard.pages.team.invitingButton") : t("dashboard.pages.team.sendInviteButton")}
          </button>
        </form>
      </section>

      <section className="glass mt-4 rounded-3xl p-5 shadow-card">
        <h2 className="font-heading text-sm font-bold text-app-ink">{t("dashboard.pages.team.myCollaboratorsHeading")}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-app-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-jeon-purple/10 text-jeon-purple">
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
                  className="rounded-lg border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none disabled:opacity-60"
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

      <section className="glass mt-4 rounded-3xl p-5 shadow-card">
        <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold text-app-ink">
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
    </div>
  );
}
