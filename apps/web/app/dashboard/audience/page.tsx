"use client";

import PageSkeleton from "@/components/Skeleton";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ApiError,
  AudienceBroadcast,
  AudienceContact,
  createBroadcast,
  getAudience,
  upsertAudienceContactMeta,
  getLeadCaptureSettings,
  listBroadcasts,
  listProducts,
  listVouchers,
  DashboardProduct,
  DashboardVoucher,
  upsertLeadCaptureSettings,
} from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { IconMail, IconUsers, IconSparkle, IconWhatsapp } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";
import { useToast } from "@/components/Toast";
import PageHeader from "@/components/dashboard/page/PageHeader";
import StatusBadge from "@/components/dashboard/data/StatusBadge";
import { useErrorToast } from "@/lib/use-error-toast";

// Label status broadcast (i18n); WARNA kini terpusat di StatusBadge
// (Phase 8 cleanup) -- queued/sending/sent/failed sudah ada di peta pusat.
function buildBroadcastStatusLabel(t: (key: string) => string): Record<AudienceBroadcast["status"], string> {
  return {
    queued: t("dashboard.pages.audience.status.queued"),
    sending: t("dashboard.pages.audience.status.sending"),
    sent: t("dashboard.pages.audience.status.sent"),
    failed: t("dashboard.pages.audience.status.failed"),
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
  const header = "name,email,whatsapp_number,telegram_username,sources,joined_at,tags,notes";
  const rows = contacts.map((c) =>
    [c.name, c.email, c.whatsapp_number, c.telegram_username ?? "", c.sources.join("|"), c.joined_at, (c.tags ?? []).join("|"), c.notes ?? ""]
      .map((v) => `"${v.replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

// Split Audiens <-> Broadcast <-> Form Capture (JEONID-DASHBOARD-REDESIGN-
// SPEC.md §15.2-15.3, Phase 6): SATU komponen, section digerbang per-view
// lewat ?view= (contacts|broadcast|forms) -- nol perpindahan logika/state;
// sidebar Marketing menautkan Audiens & Broadcast sebagai entri terpisah.
// useSearchParams butuh Suspense (dok Next). LENGKAP & stabil di
// production sejak v0.37.0/v0.38.0, flag "marketing" dihapus dari file
// ini 8 September 2026.
type AudienceView = "contacts" | "broadcast" | "forms";
const AUDIENCE_VIEW_FROM_URL: Record<string, AudienceView> = {
  contacts: "contacts",
  broadcast: "broadcast",
  forms: "forms",
};

export default function DashboardAudiencePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardAudiencePageInner />
    </Suspense>
  );
}

function DashboardAudiencePageInner() {
  const { t } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: AudienceView = AUDIENCE_VIEW_FROM_URL[searchParams.get("view") ?? "contacts"] ?? "contacts";
  function setView(next: AudienceView) {
    router.replace(`/dashboard/audience?view=${next}`, { scroll: false });
  }
  const BROADCAST_STATUS_LABEL = buildBroadcastStatusLabel(t);
  const SOURCE_LABEL = buildSourceLabel(t);
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  // CRM ringan (benchmark Linktree Earn > Contacts): filter tag/sumber +
  // editor tag & catatan per kontak. Filter dihitung di klien -- daftar
  // kontak sudah ada di memori, tidak perlu round-trip.
  const [tagFilter, setTagFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [editing, setEditing] = useState<{ key: string; tags: string; notes: string } | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);
  // newContacts (kontak 30 hari terakhir) DIHITUNG saat fetch, bukan di
  // badan render -- `Date.now()` di render dilarang eslint-plugin-react-hooks
  // v7 ("Cannot call impure function during render"), pola sama seperti
  // greetingKey di Beranda yang juga dihitung di effect.
  const [newContacts, setNewContacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectWhatsapp, setCollectWhatsapp] = useState(false);
  // Subscribe v2 (benchmark Linktree "Member"): Telegram + hadiah setelah
  // mendaftar (lead magnet = produk berfile, voucher sambutan = voucher toko).
  const [collectTelegram, setCollectTelegram] = useState(false);
  const [magnetProductId, setMagnetProductId] = useState("");
  const [welcomeVoucherId, setWelcomeVoucherId] = useState("");
  const [fileProducts, setFileProducts] = useState<DashboardProduct[]>([]);
  const [activeVouchers, setActiveVouchers] = useState<DashboardVoucher[]>([]);

  // Broadcast email (Gap #3 benchmark kompetitif, 9 Agustus 2026) --
  // subject/body form, riwayat broadcast, & error terpisah dari form
  // pengaturan lead-capture di atas supaya keduanya independen.
  const [broadcasts, setBroadcasts] = useState<AudienceBroadcast[]>([]);
  const [broadcastSubject, setBroadcastSubject] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  useErrorToast(broadcastError);
  const [broadcastSent, setBroadcastSent] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getLeadCaptureSettings(), getAudience(), listBroadcasts(), listProducts().catch(() => []), listVouchers().catch(() => [])])
      .then(([s, c, b, prods, vchs]) => {
        setEnabled(s.is_active);
        setTitle(s.title);
        setCollectEmail(s.collect_email);
        setCollectWhatsapp(s.collect_whatsapp);
        setCollectTelegram(s.collect_telegram);
        setMagnetProductId(s.magnet_product_id ?? "");
        setWelcomeVoucherId(s.welcome_voucher_id ?? "");
        setFileProducts(prods.filter((x) => x.has_file));
        setActiveVouchers(vchs.filter((v) => v.is_active));
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
    if (enabled && !collectEmail && !collectWhatsapp && !collectTelegram) {
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
        collect_telegram: collectTelegram,
        magnet_product_id: magnetProductId,
        welcome_voucher_id: welcomeVoucherId,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.audience.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const contactKeyOf = (c: AudienceContact) => (c.email ? c.email.toLowerCase() : `wa:${c.whatsapp_number}`);
  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags ?? []))).sort((a, b) => a.localeCompare(b));
  const visibleContacts = contacts.filter((c) => {
    if (sourceFilter && !c.sources.includes(sourceFilter)) return false;
    if (tagFilter === "__none__") return (c.tags ?? []).length === 0;
    if (tagFilter && !(c.tags ?? []).includes(tagFilter)) return false;
    return true;
  });

  function openEdit(c: AudienceContact) {
    setEditing({ key: contactKeyOf(c), tags: (c.tags ?? []).join(", "), notes: c.notes ?? "" });
  }

  async function handleSaveMeta() {
    if (!editing) return;
    const target = contacts.find((c) => contactKeyOf(c) === editing.key);
    if (!target) return;
    setSavingMeta(true);
    try {
      const saved = await upsertAudienceContactMeta({
        email: target.email,
        whatsapp_number: target.whatsapp_number,
        tags: editing.tags.split(",").map((x) => x.trim()).filter(Boolean),
        notes: editing.notes,
      });
      setContacts((prev) => prev.map((c) => (contactKeyOf(c) === editing.key ? { ...c, tags: saved.tags, notes: saved.notes } : c)));
      setEditing(null);
      showToast(t("dashboard.pages.audience.contactSaved"));
    } catch {
      showToast(t("dashboard.pages.audience.contactSaveFailed"));
    } finally {
      setSavingMeta(false);
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
      <PageHeader
        title={
          view === "broadcast"
            ? t("dashboard.nav.marketingBroadcast")
            : view === "forms"
              ? t("dashboard.pages.audience.tabForms")
              : t("dashboard.nav.marketingAudience")
        }
        description={t("dashboard.pages.audience.intro")}
      />
      <div className="mb-5 flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { key: "contacts" as AudienceView, label: t("dashboard.nav.contacts") },
            { key: "broadcast" as AudienceView, label: t("dashboard.nav.marketingBroadcast") },
            { key: "forms" as AudienceView, label: t("dashboard.pages.audience.tabForms") },
          ]
        ).map((tb) => (
          <button
            key={tb.key}
            type="button"
            role="tab"
            aria-selected={view === tb.key}
            onClick={() => setView(tb.key)}
            className={`relative flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
              view === tb.key ? "text-jeon-purple" : "text-app-muted hover:text-app-ink"
            }`}
          >
            {tb.label}
            {view === tb.key && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-jeon-purple" aria-hidden="true" />}
          </button>
        ))}
      </div>

      {/* Ringkasan Audiens (§11.1) -- kartu ringkas dari data kontak yang
          sudah dimuat, tampil sebelum form supaya angka kunci terbaca
          lebih dulu (pola sama /balance & Ringkasan). */}
      {view === "contacts" && (
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
      )}

      {view === "forms" && saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{t("dashboard.pages.audience.saved")}</p>}

      {view === "forms" && (
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
          <label className="flex items-center gap-2 text-xs font-semibold text-app-ink">
            <input type="checkbox" checked={collectTelegram} onChange={(e) => setCollectTelegram(e.target.checked)} className="h-3.5 w-3.5 accent-jeon-purple" />
            {t("dashboard.pages.audience.collectTelegram")}
          </label>
        </div>

        <div className="rounded-lg border border-app-border p-3">
          <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.audience.rewardsHeading")}</p>
          <p className="mt-0.5 text-xs text-app-muted">{t("dashboard.pages.audience.rewardsHint")}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-app-ink">
              {t("dashboard.pages.audience.magnetLabel")}
              <select
                value={magnetProductId}
                onChange={(e) => setMagnetProductId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
              >
                <option value="">{t("dashboard.pages.audience.magnetNone")}</option>
                {fileProducts.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-app-muted">
                {fileProducts.length === 0 ? t("dashboard.pages.audience.magnetEmpty") : t("dashboard.pages.audience.magnetHint")}
              </span>
            </label>
            <label className="text-xs font-semibold text-app-ink">
              {t("dashboard.pages.audience.voucherLabel")}
              <select
                value={welcomeVoucherId}
                onChange={(e) => setWelcomeVoucherId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
              >
                <option value="">{t("dashboard.pages.audience.voucherNone")}</option>
                {activeVouchers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code} ({v.discount_type === "percentage" ? `${v.discount_value}%` : `Rp ${v.discount_value.toLocaleString("id-ID")}`})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-normal text-app-muted">
                {activeVouchers.length === 0 ? t("dashboard.pages.audience.voucherEmpty") : t("dashboard.pages.audience.voucherHint")}
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.pages.audience.saving") : t("dashboard.pages.audience.save")}
        </button>
      </form>
      )}

      {/* Broadcast Email (Gap #3 benchmark kompetitif, 9 Agustus 2026):
          sebelumnya Audiens cuma capture form + ekspor CSV, tidak ada
          jalur kirim pesan ke subscriber dari dalam produk sama sekali --
          Beacons & Linktree Pro sudah punya ini. Kirim ASINKRON lewat
          worker (lihat CreateBroadcast/HandleAudienceBroadcast di
          backend), form ini cuma menunggu konfirmasi "diantre", bukan
          menunggu semua email benar-benar terkirim satu-satu. */}
      {view === "broadcast" && (
      <section className="glass mt-8 rounded-jlg p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-blue text-[#111111]">
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
                <StatusBadge status={b.status} label={BROADCAST_STATUS_LABEL[b.status]} className="text-[10px]" />
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {view === "contacts" && (
      <>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-app-ink">
          {t("dashboard.pages.audience.managerHeading")} ({contacts.length})
        </h2>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={contacts.length === 0}
          className="rounded-lg border-2 border-jeon-ink bg-app-surface px-3 py-1.5 text-xs font-bold text-app-ink hover:border-jeon-purple disabled:opacity-50"
        >
          {t("dashboard.pages.audience.exportCsv")}
        </button>
      </div>

      {contacts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label={t("dashboard.pages.audience.colSource")}
            className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
          >
            <option value="">{t("dashboard.pages.audience.filterAllSources")}</option>
            {Array.from(new Set(contacts.flatMap((c) => c.sources))).map((src) => (
              <option key={src} value={src}>{SOURCE_LABEL[src] ?? src}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setTagFilter("")}
            aria-pressed={tagFilter === ""}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tagFilter === "" ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
          >
            {t("dashboard.pages.audience.filterAllTags")}
          </button>
          {allTags.map((tg) => (
            <button
              key={tg}
              type="button"
              onClick={() => setTagFilter(tg)}
              aria-pressed={tagFilter === tg}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tagFilter === tg ? "border-jeon-ink bg-jeon-lime text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
            >
              {tg}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTagFilter("__none__")}
            aria-pressed={tagFilter === "__none__"}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tagFilter === "__none__" ? "border-jeon-ink bg-jeon-lavender text-[#111111]" : "border-app-border text-app-muted hover:text-app-ink"}`}
          >
            {t("dashboard.pages.audience.filterNoTag")}
          </button>
        </div>
      )}

      {editing && (
        <div className="glass mt-3 rounded-jlg p-4 shadow-card" role="dialog" aria-label={t("dashboard.pages.audience.editContactTitle")}>
          <p className="text-sm font-bold text-app-ink">{t("dashboard.pages.audience.editContactTitle")}</p>
          <p className="mt-0.5 text-xs text-app-muted">{editing.key.replace(/^wa:/, "")}</p>
          <label className="mt-3 block text-xs font-semibold text-app-ink">{t("dashboard.pages.audience.tagsLabel")}</label>
          <input
            type="text"
            value={editing.tags}
            onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
            placeholder={t("dashboard.pages.audience.tagsHint")}
            className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
          <label className="mt-3 block text-xs font-semibold text-app-ink">{t("dashboard.pages.audience.notesLabel")}</label>
          <textarea
            value={editing.notes}
            onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            placeholder={t("dashboard.pages.audience.notesPlaceholder")}
            rows={3}
            maxLength={2000}
            className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={handleSaveMeta} disabled={savingMeta} className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60">
              {savingMeta ? t("dashboard.pages.audience.savingContact") : t("dashboard.pages.audience.saveContact")}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-app-border px-4 py-2 text-xs font-semibold text-app-ink">
              {t("dashboard.pages.audience.cancelEdit")}
            </button>
          </div>
        </div>
      )}

      <div className="glass mt-3 overflow-x-auto rounded-jlg shadow-card">
        <table aria-label={t("dashboard.pages.audience.managerHeading")} className="w-full text-left text-xs">
          <thead>
            <tr className="border-b-2 border-jeon-ink text-app-muted">
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colName")}</th>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colTelegram")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colSource")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colJoined")}</th>
              <th className="px-4 py-2.5 font-semibold">{t("dashboard.pages.audience.colTags")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visibleContacts.map((c, i) => (
              <tr key={i} className="border-b border-app-border last:border-0">
                <td className="px-4 py-2.5 text-app-ink">{c.name || "-"}</td>
                <td className="px-4 py-2.5 text-app-ink">{c.email || "-"}</td>
                <td className="px-4 py-2.5 text-app-ink">{c.whatsapp_number || "-"}</td>
                <td className="px-4 py-2.5 text-app-ink">{c.telegram_username ? `@${c.telegram_username}` : "-"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {c.sources.map((s) => (
                      <span key={s} className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">
                        {SOURCE_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-app-muted">{new Date(c.joined_at).toLocaleDateString("id-ID")}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {(c.tags ?? []).map((tg) => (
                      <button
                        key={tg}
                        type="button"
                        onClick={() => setTagFilter(tg)}
                        className="rounded-full bg-jeon-lime px-2 py-0.5 text-[10px] font-bold text-[#111111]"
                        title={tg}
                      >
                        {tg}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    className="rounded-md border border-app-border px-2 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
                  >
                    {t("dashboard.pages.audience.editContact")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && (
          <EmptyState bordered={false} text={t("dashboard.pages.audience.emptyContacts")} />
        )}
        {contacts.length > 0 && visibleContacts.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-app-muted">{t("dashboard.pages.audience.filterEmpty")}</p>
        )}
      </div>
      </>
      )}
    </div>
  );
}
