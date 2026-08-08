"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  AudienceContact,
  getAudience,
  getLeadCaptureSettings,
  upsertLeadCaptureSettings,
} from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";

const SOURCE_LABEL: Record<string, string> = {
  lead_capture: "Subscriber",
  buyer: "Pembeli",
  business_card: "Kartu Kontak",
};

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
  const [contacts, setContacts] = useState<AudienceContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectWhatsapp, setCollectWhatsapp] = useState(false);

  useEffect(() => {
    Promise.all([getLeadCaptureSettings(), getAudience()])
      .then(([s, c]) => {
        setEnabled(s.is_active);
        setTitle(s.title);
        setCollectEmail(s.collect_email);
        setCollectWhatsapp(s.collect_whatsapp);
        setContacts(c);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data audiens."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (enabled && !title.trim()) {
      setError("Judul blok wajib diisi.");
      return;
    }
    if (enabled && !collectEmail && !collectWhatsapp) {
      setError("Pilih minimal satu jenis data yang dikumpulkan.");
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
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan.");
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
      <p className="mt-1 text-sm text-muted">
        Kumpulkan email/WhatsApp pengunjung lewat blok di halaman publik, dan lihat semua kontak (subscriber + pembeli)
        dalam satu daftar.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Pengaturan disimpan.</p>}

      <form onSubmit={handleSave} className="glass mt-6 flex flex-col gap-4 rounded-2xl p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Aktifkan Blok Pengumpulan Lead</p>
            <p className="text-xs text-muted">Tampil di halaman publikmu kalau aktif.</p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled((v) => !v)} label="Aktifkan blok pengumpulan lead" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Judul</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Dapatkan info terbaru dariku"
            maxLength={200}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={collectEmail} onChange={(e) => setCollectEmail(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            Kumpulkan Email
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={collectWhatsapp} onChange={(e) => setCollectWhatsapp(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            Kumpulkan Nomor WhatsApp
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </form>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink">Manajer Audiens ({contacts.length})</h2>
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={contacts.length === 0}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-primary disabled:opacity-50"
        >
          Ekspor CSV
        </button>
      </div>

      <div className="glass mt-3 overflow-x-auto rounded-2xl shadow-card">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-4 py-2.5 font-semibold">Nama</th>
              <th className="px-4 py-2.5 font-semibold">Email</th>
              <th className="px-4 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-4 py-2.5 font-semibold">Sumber</th>
              <th className="px-4 py-2.5 font-semibold">Bergabung</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 text-ink">{c.name || "-"}</td>
                <td className="px-4 py-2.5 text-ink">{c.email || "-"}</td>
                <td className="px-4 py-2.5 text-ink">{c.whatsapp_number || "-"}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    {c.sources.map((s) => (
                      <span key={s} className="rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-bold text-primary">
                        {SOURCE_LABEL[s] ?? s}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted">{new Date(c.joined_at).toLocaleDateString("id-ID")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {contacts.length === 0 && (
          <EmptyState bordered={false} text="Belum ada kontak -- aktifkan blok pengumpulan lead atau tunggu pembeli pertama." />
        )}
      </div>
    </div>
  );
}
