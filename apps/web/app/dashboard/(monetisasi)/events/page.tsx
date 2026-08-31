"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { ApiError, DashboardEvent, createEvent, deleteProduct, listEvents, updateProduct } from "@/lib/api-client";
import { IconCalendar, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";
import { useLocale } from "@/lib/locale-context";
import { dashRedesignEnabled } from "@/lib/dashboard-flags";
import PageHeader from "@/components/dashboard/page/PageHeader";

// Indonesia TIDAK memakai daylight saving time -- offset per zona waktu
// TETAP sepanjang tahun, jadi cukup peta statis ke offset UTC tanpa
// pustaka timezone. Dipakai untuk membangun string RFC3339 langsung dari
// <input type="datetime-local"> (yang cuma memberi jam-dinding tanpa info
// zona) sesuai zona yang dipilih kreator, BUKAN zona waktu browser pengunjung.
const TIMEZONE_OPTIONS: { value: string; offset: string }[] = [
  { value: "Asia/Jakarta", offset: "+07:00" },
  { value: "Asia/Makassar", offset: "+08:00" },
  { value: "Asia/Jayapura", offset: "+09:00" },
  { value: "UTC", offset: "+00:00" },
];

function toRFC3339(localDateTime: string, timezone: string): string {
  const tz = TIMEZONE_OPTIONS.find((t) => t.value === timezone);
  return `${localDateTime}:00${tz?.offset ?? "+07:00"}`;
}

export default function DashboardEventsPage() {
  const { t } = useLocale();
  // Manager template v2 (SPEC §7.2/§14, Phase 5, flag "sales"):
  // PageHeader + primary create action di kanan; kartu form create hanya
  // tampil saat `adding`. Legacy (subtitle + tombol toggle) saat flag off.
  const salesV2 = dashRedesignEnabled("sales");
  const timezoneLabels: Record<string, string> = {
    "Asia/Jakarta": t("dashboard.pages.events.timezones.wib"),
    "Asia/Makassar": t("dashboard.pages.events.timezones.wita"),
    "Asia/Jayapura": t("dashboard.pages.events.timezones.wit"),
    UTC: t("dashboard.pages.events.timezones.utc"),
  };
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [location, setLocation] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [capacity, setCapacity] = useState("");

  function reload() {
    return listEvents().then(setEvents);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.events.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setName("");
    setDescription("");
    setPriceIDR("");
    setStartsAt("");
    setEndsAt("");
    setTimezone("Asia/Jakarta");
    setLocation("");
    setIsOnline(true);
    setCapacity("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError(t("dashboard.pages.events.errors.nameAndPriceRequired"));
      return;
    }
    if (!startsAt || !endsAt) {
      setError(t("dashboard.pages.events.errors.datesRequired"));
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createEvent({
        name,
        description,
        price_idr: price,
        starts_at: toRFC3339(startsAt, timezone),
        ends_at: toRFC3339(endsAt, timezone),
        timezone,
        location,
        is_online: isOnline,
        capacity: capacity ? Number(capacity) : undefined,
      });
      await reload();
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.events.errors.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(event: DashboardEvent) {
    const nextActive = !event.is_active;
    setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_active: nextActive } : e)));
    try {
      await updateProduct(event.id, { is_active: nextActive });
    } catch (err) {
      setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, is_active: event.is_active } : e)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.events.errors.updateStatusFailed"));
    }
  }

  async function handleDelete(event: DashboardEvent) {
    if (!(await confirmDelete(t("dashboard.pages.events.confirmDeleteText").replace("{name}", event.name)))) return;
    const previous = events;
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setBusyId(event.id);
    try {
      await deleteProduct(event.id);
    } catch (err) {
      setEvents(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.events.errors.deleteFailed"));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      {salesV2 ? (
        <PageHeader
          title={t("dashboard.extraPages.events")}
          description={t("dashboard.pages.events.subtitle")}
          primaryAction={{ label: t("dashboard.pages.events.createButton"), onClick: () => setAdding(true), icon: <IconPlus className="h-4 w-4" /> }}
        />
      ) : (
        <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.events.subtitle")}</p>
      )}

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {(!salesV2 || adding) && (
      <div className="glass mt-6 rounded-jlg p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            {t("dashboard.pages.events.createButton")}
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.nameLabel")}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dashboard.pages.events.namePlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.priceLabel")}</label>
              <input
                type="number"
                required
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.startsLabel")}</label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.endsLabel")}</label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.timezoneLabel")}</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {timezoneLabels[tz.value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={isOnline} onChange={() => setIsOnline((v) => !v)} label={t("dashboard.pages.events.onlineAria")} />
              <span className="text-xs font-semibold text-app-ink">{isOnline ? t("dashboard.pages.events.online") : t("dashboard.pages.events.offline")}</span>
            </div>
            {!isOnline && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.locationLabel")}</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("dashboard.pages.events.locationPlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.events.capacityLabel")}</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.events.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? t("dashboard.pages.events.creating") : t("dashboard.pages.events.createButton")}
              </button>
            </div>
          </form>
        )}
      </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {events.map((ev) => (
          <div key={ev.id} className="glass rounded-jmd p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCalendar className="h-4 w-4 text-jeon-purple" />
                <p className="text-sm font-bold text-app-ink">{ev.name}</p>
              </div>
              <span className="text-sm font-bold text-jeon-purple">Rp {ev.price_idr.toLocaleString("id-ID")}</span>
            </div>
            <p className="mt-1 text-xs text-app-muted">
              {new Date(ev.starts_at).toLocaleString("id-ID")} ({ev.timezone}) &middot;{" "}
              {ev.is_online ? t("dashboard.pages.events.online") : ev.location || t("dashboard.pages.events.offlineShort")}
            </p>
            <p className="mt-1 text-xs text-app-muted">
              {ev.attendee_count} {t("dashboard.pages.events.attendeesLabel")}
              {ev.capacity !== null ? ` ${t("dashboard.pages.events.slotSuffix").replace("{capacity}", String(ev.capacity))}` : ` ${t("dashboard.pages.events.noCapacityLabel")}`}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={ev.is_active} onChange={() => handleToggleActive(ev)} label={t("dashboard.pages.events.activateAria").replace("{name}", ev.name)} />
                <span className="text-xs font-semibold text-app-muted">{t("dashboard.pages.events.activeLabel")}</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(ev)}
                disabled={busyId === ev.id}
                title={t("dashboard.pages.events.deleteTitle")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {events.length === 0 && <EmptyState text={t("dashboard.pages.events.emptyEvents")} />}
      </div>
    </div>
  );
}
