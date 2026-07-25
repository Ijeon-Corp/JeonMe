"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardCollaborator,
  PendingCollaborationInvite,
  acceptCollaborationInvite,
  inviteCollaborator,
  listCollaborators,
  listInvitesForMe,
  revokeCollaborator,
} from "@/lib/api-client";
import { IconCheck, IconTrash, IconUsers } from "@/components/icons";
import EmptyState from "@/components/EmptyState";

const STATUS_LABEL: Record<DashboardCollaborator["status"], string> = {
  invited: "Menunggu diterima",
  active: "Aktif",
  revoked: "Dicabut",
};

export default function DashboardTeamPage() {
  const [collaborators, setCollaborators] = useState<DashboardCollaborator[]>([]);
  const [invitesForMe, setInvitesForMe] = useState<PendingCollaborationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [canEditLinks, setCanEditLinks] = useState(true);
  const [canEditProducts, setCanEditProducts] = useState(false);
  const [canEditDesign, setCanEditDesign] = useState(false);
  const [inviting, setInviting] = useState(false);

  function reload() {
    return Promise.all([listCollaborators(), listInvitesForMe()]).then(([c, i]) => {
      setCollaborators(c);
      setInvitesForMe(i);
    });
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data tim."))
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Isi email kolaborator.");
      return;
    }
    if (!canEditLinks && !canEditProducts && !canEditDesign) {
      setError("Pilih minimal satu akses.");
      return;
    }
    setError(null);
    setInviting(true);
    try {
      await inviteCollaborator({
        email: email.trim(),
        can_edit_links: canEditLinks,
        can_edit_products: canEditProducts,
        can_edit_design: canEditDesign,
      });
      setEmail("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat undangan.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(c: DashboardCollaborator) {
    if (!window.confirm(`Cabut akses "${c.email}"?`)) return;
    setError(null);
    setBusyId(c.id);
    try {
      await revokeCollaborator(c.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencabut akses.");
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menerima undangan.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Tim & Kolaborator</h1>
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
                  <p className="text-[11px] text-muted">
                    {[inv.can_edit_links && "Tautan", inv.can_edit_products && "Produk", inv.can_edit_design && "Desain"]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
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
            type="email"
            placeholder="email@contoh.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-ink">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={canEditLinks} onChange={(e) => setCanEditLinks(e.target.checked)} />
              Tautan
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={canEditProducts} onChange={(e) => setCanEditProducts(e.target.checked)} />
              Produk
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={canEditDesign} onChange={(e) => setCanEditDesign(e.target.checked)} />
              Desain
            </label>
          </div>
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
            <li key={c.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                  <IconUsers className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{c.email}</p>
                  <p className="text-[11px] text-muted">
                    {STATUS_LABEL[c.status]} &middot;{" "}
                    {[c.can_edit_links && "Tautan", c.can_edit_products && "Produk", c.can_edit_design && "Desain"]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => handleRevoke(c)}
                title="Cabut akses"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
          {collaborators.length === 0 && <EmptyState as="li" text="Belum ada kolaborator." />}
        </ul>
      </section>
    </div>
  );
}
