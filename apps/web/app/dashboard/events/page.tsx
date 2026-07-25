"use client";

import { useEffect, useState } from "react";
import { ApiError, DashboardEvent, createEvent, deleteProduct, listEvents, updateProduct } from "@/lib/api-client";
import { IconCalendar, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";

// Indonesia TIDAK memakai daylight saving time -- offset per zona waktu
// TETAP sepanjang tahun, jadi cukup peta statis ke offset UTC tanpa
// pustaka timezone. Dipakai untuk membangun string RFC3339 langsung dari
// <input type="datetime-local"> (yang cuma memberi jam-dinding tanpa info
// zona) sesuai zona yang dipilih kreator, BUKAN zona waktu browser pengunjung.
const TIMEZONE_OPTIONS: { value: string; label: string; offset: string }[] = [
  { value: "Asia/Jakarta", label: "WIB (Jakarta)", offset: "+07:00" },
  { value: "Asia/Makassar", label: "WITA (Makassar)", offset: "+08:00" },
  { value: "Asia/Jayapura", label: "WIT (Jayapura)", offset: "+09:00" },
  { value: "UTC", label: "UTC (event internasional/online)", offset: "+00:00" },
];

function toRFC3339(localDateTime: string, timezone: string): string {
  const tz = TIMEZONE_OPTIONS.find((t) => t.value === timezone);
  return `${localDateTime}:00${tz?.offset ?? "+07:00"}`;
}

export default function DashboardEventsPage() {
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat event."))
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
      setError("Nama event wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (!startsAt || !endsAt) {
      setError("Isi waktu mulai dan berakhir event.");
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
      setError(err instanceof ApiError ? err.message : "Gagal membuat event.");
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
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status event.");
    }
  }

  async function handleDelete(event: DashboardEvent) {
    if (!window.confirm(`Hapus event "${event.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    const previous = events;
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    setBusyId(event.id);
    try {
      await deleteProduct(event.id);
    } catch (err) {
      setEvents(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus event.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Event</h1>
      <p className="mt-1 text-sm text-muted">
        Jual tiket event online/offline dengan tanggal, waktu, zona waktu, dan kuota peserta.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            Buat Event
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Nama Event</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Workshop Fotografi Dasar"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Harga Tiket (Rp)</label>
              <input
                type="number"
                required
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Mulai</label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Berakhir</label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Zona Waktu</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Toggle checked={isOnline} onChange={() => setIsOnline((v) => !v)} label="Event online" />
              <span className="text-xs font-semibold text-ink">{isOnline ? "Online" : "Offline (tatap muka)"}</span>
            </div>
            {!isOnline && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Lokasi</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Jl. Contoh No. 1, Jakarta"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Kuota Peserta (kosongkan untuk tanpa batas)</label>
              <input
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Event"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {events.map((ev) => (
          <div key={ev.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCalendar className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold text-ink">{ev.name}</p>
              </div>
              <span className="text-sm font-bold text-secondary-dark">Rp {ev.price_idr.toLocaleString("id-ID")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {new Date(ev.starts_at).toLocaleString("id-ID")} ({ev.timezone}) &middot;{" "}
              {ev.is_online ? "Online" : ev.location || "Offline"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {ev.attendee_count} pendaftar{ev.capacity !== null ? ` / ${ev.capacity} slot` : " (tanpa batas kuota)"}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={ev.is_active} onChange={() => handleToggleActive(ev)} label={`Aktifkan ${ev.name}`} />
                <span className="text-xs font-semibold text-muted">Aktif</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(ev)}
                disabled={busyId === ev.id}
                title="Hapus event"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        {events.length === 0 && <EmptyState text='Belum ada event -- klik "Buat Event" di atas untuk membuat yang pertama.' />}
      </div>
    </div>
  );
}
