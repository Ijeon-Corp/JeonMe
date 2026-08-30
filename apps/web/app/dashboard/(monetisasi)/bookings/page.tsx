"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import {
  ApiError,
  DashboardBooking,
  DashboardBookingSlot,
  createBooking,
  createBookingSlots,
  deleteBookingSlot,
  listBookingSlots,
  listBookings,
  updateProduct,
} from "@/lib/api-client";
import { IconCalendar, IconChevronRight, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";

// Indonesia TIDAK memakai daylight saving time -- pola sama seperti
// dashboard/events, offset UTC tetap sepanjang tahun.
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

export default function DashboardBookingsPage() {
  const { t } = useLocale();
  const timezoneLabels: Record<string, string> = {
    "Asia/Jakarta": t("dashboard.pages.bookings.timezones.wib"),
    "Asia/Makassar": t("dashboard.pages.bookings.timezones.wita"),
    "Asia/Jayapura": t("dashboard.pages.bookings.timezones.wit"),
    UTC: t("dashboard.pages.bookings.timezones.utc"),
  };
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");

  const [managingId, setManagingId] = useState<string | null>(null);
  const [slots, setSlots] = useState<DashboardBookingSlot[]>([]);
  const [slotTime, setSlotTime] = useState("");
  const [slotTimezone, setSlotTimezone] = useState("Asia/Jakarta");
  const [addingSlot, setAddingSlot] = useState(false);

  function reload() {
    return listBookings().then(setBookings);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setName("");
    setDescription("");
    setPriceIDR("");
    setDurationMinutes("30");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    const duration = Number(durationMinutes);
    if (!name.trim() || !price || price < 1000) {
      setError(t("dashboard.pages.bookings.errors.nameAndPriceRequired"));
      return;
    }
    if (!duration || duration < 5) {
      setError(t("dashboard.pages.bookings.errors.durationTooShort"));
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createBooking({ name, description, price_idr: price, duration_minutes: duration });
      await reload();
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.createFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(booking: DashboardBooking) {
    const nextActive = !booking.is_active;
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, is_active: nextActive } : b)));
    try {
      await updateProduct(booking.id, { is_active: nextActive });
    } catch (err) {
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, is_active: booking.is_active } : b)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.updateStatusFailed"));
    }
  }

  async function handleOpenSlots(booking: DashboardBooking) {
    setError(null);
    setManagingId(booking.id);
    try {
      setSlots(await listBookingSlots(booking.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.loadSlotsFailed"));
      setManagingId(null);
    }
  }

  async function handleAddSlot() {
    if (!managingId || !slotTime) {
      setError(t("dashboard.pages.bookings.errors.slotTimeRequired"));
      return;
    }
    setError(null);
    setAddingSlot(true);
    try {
      await createBookingSlots(managingId, [toRFC3339(slotTime, slotTimezone)]);
      setSlots(await listBookingSlots(managingId));
      setSlotTime("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.addSlotFailed"));
    } finally {
      setAddingSlot(false);
    }
  }

  async function handleDeleteSlot(slotId: string) {
    if (!managingId) return;
    setError(null);
    try {
      await deleteBookingSlot(managingId, slotId);
      setSlots(await listBookingSlots(managingId));
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.bookings.errors.deleteSlotFailed"));
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mt-1 text-sm text-app-muted">
        {t("dashboard.pages.bookings.subtitle")}
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mt-6 rounded-3xl p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            {t("dashboard.pages.bookings.createButton")}
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.bookings.sessionNameLabel")}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dashboard.pages.bookings.sessionNamePlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.bookings.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.bookings.priceLabel")}</label>
                <input
                  type="number"
                  required
                  min={1000}
                  value={priceIDR}
                  onChange={(e) => setPriceIDR(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.bookings.durationLabel")}</label>
                <input
                  type="number"
                  required
                  min={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </div>
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
                {t("dashboard.pages.bookings.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? t("dashboard.pages.bookings.creating") : t("dashboard.pages.bookings.createButton")}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {bookings.map((booking) => (
          <div key={booking.id} className="glass rounded-2xl p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCalendar className="h-4 w-4 text-jeon-purple" />
                <p className="text-sm font-bold text-app-ink">{booking.name}</p>
              </div>
              <span className="text-sm font-bold text-jeon-purple">Rp {booking.price_idr.toLocaleString("id-ID")}</span>
            </div>
            <p className="mt-1 text-xs text-app-muted">
              {t("dashboard.pages.bookings.slotSummary")
                .replace("{duration}", String(booking.duration_minutes))
                .replace("{available}", String(booking.available_slot_count))
                .replace("{booked}", String(booking.booked_slot_count))}
            </p>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={booking.is_active} onChange={() => handleToggleActive(booking)} label={t("dashboard.pages.bookings.activateAria").replace("{name}", booking.name)} />
                <span className="text-xs font-semibold text-app-muted">{t("dashboard.pages.bookings.activeLabel")}</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenSlots(booking)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-jeon-purple hover:bg-jeon-purple/10"
              >
                {t("dashboard.pages.bookings.manageSlots")}
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {managingId === booking.id && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-app-border bg-jeon-purple/10/20 p-3">
                <div className="flex flex-wrap gap-2">
                  <input
                    type="datetime-local"
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <select
                    value={slotTimezone}
                    onChange={(e) => setSlotTimezone(e.target.value)}
                    className="rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {timezoneLabels[tz.value]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSlot}
                    disabled={addingSlot}
                    className="btn-primary rounded-lg px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {addingSlot ? t("dashboard.pages.bookings.addingSlot") : t("dashboard.pages.bookings.addSlot")}
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {slots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center justify-between rounded-lg border border-app-border bg-app-surface px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-app-ink">
                          {new Date(slot.starts_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                        {slot.is_booked && <p className="text-app-muted">{t("dashboard.pages.bookings.bookedBy").replace("{email}", slot.buyer_email ?? "")}</p>}
                      </div>
                      {!slot.is_booked && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slot.id)}
                          className="flex h-6 w-6 items-center justify-center rounded text-red-600 hover:bg-red-50"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {slots.length === 0 && <p className="text-xs text-app-muted">{t("dashboard.pages.bookings.noSlotsYet")}</p>}
                </div>

                <button
                  type="button"
                  onClick={() => setManagingId(null)}
                  className="rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted hover:border-ink/30"
                >
                  {t("dashboard.pages.bookings.close")}
                </button>
              </div>
            )}
          </div>
        ))}

        {bookings.length === 0 && <EmptyState text={t("dashboard.pages.bookings.emptyBookings")} />}
      </div>
    </div>
  );
}
