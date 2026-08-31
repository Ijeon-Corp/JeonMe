"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  AudienceBroadcast,
  AudienceContact,
  createBroadcast,
  getAudience,
  getLeadCaptureSettings,
  listBroadcasts,
  upsertLeadCaptureSettings,
} from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { IconMail, IconUsers, IconSparkle, IconWhatsapp } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

function buildBroadcastStatusLabel(t: (key: string) => string): Record<AudienceBroadcast["status"], { label: string; className: string }> {
  return {
    queued: { label: t("dashboard.pages.audience.status.queued"), className: "bg-pop-yellow-tint text-jeon-warning" },
    sending: { label: t("dashboard.pages.audience.status.sending"), className: "bg-pop-blue-tint text-pop-blue" },
    sent: { label: t("dashboard.pages.audience.status.sent"), className: "bg-jeon-purple/10 text-jeon-purple" },
    failed: { label: t("dashboard.pages.audience.status.failed"), className: "bg-red-50 text-red-600" },
  };
}

function buildSourceLabel(t: (key: string) => string): Record<string, string> {
  return {
    lead_capture: t("dashboard.pages.audience.source.subscriber"),
    buyer: t("dashboard.pages.audience.source.buyer"),
    business_card: t("dashboard.pages.audience.source.businessCard"),
  };
}

function toCSV(contacts: AudienceContact[]): string {
  const header = "name,email,whatsapp_number,sources,joined_at";
  const rows = contacts.map((c) =>
    [c.name, c.email, c.whatsapp_number, c.sources.join("|"), c.joined_at]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

export default function DashboardAudiencePage() {
  const { t } = useLocale();
  const BROADCAST_STATUS_LABEL = buildBroadcastStatusLabel(t);
  const SOURCE_LABEL = buildSourceLabel(t);
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  // newContacts (kontak 30 hari terakhir) DIHITUNG saat fetch, bukan di
  // badan render -- `Date.now()` di render dilarang eslint-plugin-react-hooks
  // v7 ("Cannot call impure function during render"), pola sama seperti
  // greetingKey di Beranda yang juga dihitung di effect.
  const [newContacts, setNewContacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectWhatsapp, setCollectWhatsapp] = useState(false);

  // Broadcast email (Gap #3 benchmark kompetitif, 9 Agustus 2026) --
  // subject/body form, riwayat broadcast, & error terpisah dari form
  // pengaturan lead-capture di atas supaya keduanya independen.
  const [broadcasts, setBroadcasts] = useState<AudienceBroadcast[]>([]);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastSent, setBroadcastSent] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getLeadCaptureSettings(), getAudience(), listBroadcasts()])
      .then(([s, c, b]) => {
        setEnabled(s.is_active);
        setTitle(s.title);
        setCollectEmail(s.collect_email);
        setCollectWhatsapp(s.collect_whatsapp);
        setContacts(c);
        setBroadcasts(b);
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        setNewContacts(
          c.filter((ct) => {
            const ts = new Date(ct.joined_at).getTime();
            return !Number.isNaN(ts) && ts >= thirtyDaysAgo;
          }).length
        );
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.audience.loadError")))
      .finally(() => setLoading(false));
  }, []);

  // subscriberCount -- backend CreateBroadcast HANYA menyasar tabel
  // `subscribers` (sumber "lead_capture"), BUKAN seluruh Audiens gabungan
  // (yang juga berisi pembeli -- lihat catatan consent di migrations/
  // 000059). Dihitung sama persis di sini supaya angka yang ditampilkan
  // ke kreator SEBELUM kirim cocok dengan yang benar-benar akan dikirimi,
  // bukan salah menjanjikan menyasar semua kontak di tabel bawah.
  const subscriberCount = contacts.filter((c) => c.email && c.sources.includes("lead_capture")).length;

  // Ringkasan Audiens (DASHBOARD-DESIGN-JEONID.md §11.1) -- DIHITUNG dari
  // `contacts` yang SUDAH di-fetch, bukan endpoint/agregat baru: total,
  // kontak baru 30 hari (dari joined_at), dan kelengkapan email/WhatsApp.
  // Field lain di §11.1 (consent status, subscriber growth) TIDAK
  // ditampilkan -- backend belum mengekspos datanya, jadi sengaja tidak
  // dikarang (aturan §13.7 "zero bukan loading", jangan tampilkan metrik
  // yang tidak nyata). Persen dibulatkan; guard pembagian nol.
  const totalContacts = contacts.length;
  const emailCount = contacts.filter((c) => c.email).length;
  const whatsappCount = contacts.filter((c) => c.whatsapp_number).length;
  const pctOf = (n: number) => (totalContacts === 0 ? 0 : Math.round((n / totalContacts) * 100));

  async function handleSendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!broadcastSubject.trim() || !broadcastBody.trim()) {
      setBroadcastError(t("dashboard.pages.audience.broadcastValidation"));
      return;
    }
    setBroadcastError(null);
    setBroadcastSent(null);
    setSendingBroadcast(true);
    try {
      const res = await createBroadcast({ subject: broadcastSubject.trim(), body: broadcastBody.trim() });
      setBroadcastSubject("");
      setBroadcastBody("");
      setBroadcastSent(
        `${t("dashboard.pages.audience.broadcastQueuedBefore")}${res.recipient_count}${t("dashboard.pages.audience.broadcastQueuedAfter")}`
      );
      const refreshed = await listBroadcasts();
      setBroadcasts(refreshed);
    } catch (err) {
      setBroadcastError(err instanceof ApiError ? err.message : t("dashboard.pages.audience.broadcastSendError"));
    } finally {
      setSendingBroadcast(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (enabled && !title.trim()) {
      setError(t("dashboard.pages.audience.titleRequired"));
      return;
    }
    if (enabled && !collectEmail && !collectWhatsapp) {
      setError(t("dashboard.pages.audience.dataTypeRequired"));
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertLeadCaptureSettings({
        is_active: enabled,
        title: title.trim(),
        collect_email: collectEmail,
        collect_whatsapp: collectWhatsapp,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.audience.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleExportCSV() {
    const csv = toCSV(contacts);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audiens-jeonme.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.audience.intro")}</p>

      {/* Ringkasan Audiens (§11.1) -- kartu ringkas dari data kontak yang
          sudah dimuat, tampil sebelum form supaya angka kunci terbaca
          lebih dulu (pola sama /balance & Ringkasan). */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          tone="brand"
          icon={<IconUsers className="h-4 w-4" />}
          label={t("dashboard.pages.audience.overviewTotal")}
          value={totalContacts.toLocaleString("id-ID")}
          pct={null}
          sub=""
        />
        <StatCard
          icon={<IconSparkle className="h-4 w-4" />}
          label={t("dashboard.pages.audience.overviewNew")}
          value={newContacts.toLocaleString("id-ID")}
          pct={null}
          sub={t("dashboard.pages.audience.overviewNewSub")}
        />
        <StatCard
          icon={<IconMail className="h-4 w-4" />}
          label={t("dashboard.pages.audience.overviewEmail")}
          value={emailCount.toLocaleString("id-ID")}
          pct={null}
          sub={`${pctOf(emailCount)}% ${t("dashboard.pages.audience.overviewOfTotal")}`}
        />
        <StatCard
          icon={<IconWhatsapp className="h-4 w-4" />}
          label={t("dashboard.pages.audience.overviewWhatsapp")}
          value={whatsappCount.toLocaleString("id-ID")}
          pct={null}
          sub={`${pctOf(whatsappCount)}% ${t("dashboard.pages.audience.overviewOfTotal")}`}
        />
      </section>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.audience.saved")}</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-jlg p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.audience.enableTitle")}</p>
            <p className="text-xs text-app-muted">{t("dashboard.pages.audience.enableHint")}</p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label={t("dashboard.pages.audience.enableToggleLabel")} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.audience.titleLabel")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("dashboard.pages.audience.titlePlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-app-ink">
            <input type="checkbox" checked={collectEmail} onChange={(e) => setCollectEmail(e.target.checked)} className="h-3.5 w-3.5 accent-jeon-purple" />
            {t("dashboard.pages.audience.collectEmail")}
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-app-ink">
            <input type="checkbox" checked={collectWhatsapp} onChange={(e) => setCollectWhatsapp(e.target.checked)} className="h-3.5 w-3.5 accent-jeon-purple" />
            {t("dashboard.pages.audience.collectWhatsapp")}
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.audience.saving") : t("dashboard.pages.audience.save")}
        </button>
      </form>

      {/* Broadcast Email (Gap #3 benchmark kompetitif, 9 Agustus 2026):
          sebelumnya Audiens cuma capture form + ekspor CSV, tidak ada
          jalur kirim pesan ke subscriber dari dalam produk sama sekali --
          Beacons & Linktree Pro sudah punya ini. Kirim ASINKRON lewat
          worker (lihat CreateBroadcast/HandleAudienceBroadcast di
          backend), form ini cuma menunggu konfirmasi "diantre", bukan
          menunggu semua email benar-benar terkirim satu-satu. */}
      <section className="glass mt-8 rounded-jlg p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-pop-blue-tint text-pop-blue">
            <IconMail className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-app-ink">{t("dashboard.pages.audience.broadcastHeading")}</h2>
            <p className="text-xs text-app-muted">
              {t("dashboard.pages.audience.broadcastDescBefore")}
              {subscriberCount}
              {t("dashboard.pages.audience.broadcastDescAfter")}
            </p>
          </div>
        </div>

        {broadcastError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{broadcastError}</p>}
        {broadcastSent && <p className="mt-3 rounded-lg bg-jeon-purple/10 px-3 py-2 text-sm text-jeon-purple">{broadcastSent}</p>}

        <form onSubmit={handleSendBroadcast} className="mt-4 flex flex-col gap-3">
          <input
            type="text"
            value={broadcastSubject}
            onChange={(e) => setBroadcastSubject(e.target.value)}
            placeholder={t("dashboard.pages.audience.subjectPlaceholder")}
            maxLength={200}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <textarea
            value={broadcastBody}
            onChange={(e) => setBroadcastBody(e.target.value)}
            placeholder={t("dashboard.pages.audience.bodyPlaceholder")}
            maxLength={5000}
            rows={5}
            className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
          />
          <button
            type="submit"
            disabled={sendingBroadcast || subscriberCount === 0}
            className="btn-primary self-start rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {sendingBroadcast
              ? t("dashboard.pages.audience.sending")
              : `${t("dashboard.pages.audience.sendToBefore")}${subscriberCount}${t("dashboard.pages.audience.sendToAfter")}`}
          </button>
        </form>

        {broadcasts.length > 0 && (
          <div className="mt-5 flex flex-col gap-1.5 border-t border-app-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.audience.broadcastHistory")}</p>
            {broadcasts.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-app-ink">{b.subject}</p>
                  <p className="text-app-muted">
                    {b.sent_count}/{b.recipient_count} {t("dashboard.pages.audience.sentSuffix")} &middot; {new Date(b.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${BROADCAST_STATUS_LABEL[b.status].className}`}>
                  {BROADCAST_STATUS_LABEL[b.status].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-app-ink">
          {t("dashboard.pages.audience.managerHeading")} ({contacts.length})
        </h2>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={contacts.length === 0}
          className="rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-bold text-app-ink hover:border-jeon-purple disabled:opacity-50"
        >
          {t("dashboard.pages.audience.exportCsv")}
        </button>
      </div>

      <div className="glass mt-3 overflow-x-auto rounded-jlg shadow-card">
        <table aria-label={t("dashboard.pages.audience.managerHeading")} className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-app-border text-app-muted">
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colName")}</th>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colSource")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colJoined")}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <tr key={i} className="border-b border-app-border last:border-0">
                <td className="px-4 py-2.5 text-app-ink">{c.name || "-"}</td>
                <td className="px-4 py-2.5 text-app-ink">{c.email || "-"}</td>
                <td className="px-4 py-2.5 text-app-ink">{c.whatsapp_number || "-"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {c.sources.map((s) => (
                      <span key={s} className="rounded-full bg-jeon-purple/10 px-2 py-0.5 text-[10px] font-bold text-jeon-purple">
                        {SOURCE_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-app-muted">{new Date(c.joined_at).toLocaleDateString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && (
          <EmptyState bordered={false} text={t("dashboard.pages.audience.emptyContacts")} />
        )}
      </div>
    </div>
  );
}
