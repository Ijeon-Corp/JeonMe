"use client";

import { useEffect, useState } from "react";
import { ApiError, BusinessCard, getBusinessCard, getMyPage, upsertBusinessCard } from "@/lib/api-client";
import Toggle from "@/components/Toggle";
import QRCodeModal from "@/components/QRCodeModal";
import { IconQrCode } from "@/components/icons";

const EMPTY: BusinessCard = {
  is_active: false,
  full_name: "",
  job_title: "",
  company: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  website: "",
  collect_contact_back: false,
};

export default function DashboardBusinessCardPage() {
  const [card, setCard] = useState<BusinessCard>(EMPTY);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    Promise.all([getBusinessCard(), getMyPage()])
      .then(([c, p]) => {
        setCard(c);
        setUsername(p.username);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat kartu kontak."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (card.is_active && !card.full_name.trim()) {
      setError("Nama lengkap wajib diisi.");
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await upsertBusinessCard(card);
      const refreshed = await getBusinessCard();
      setCard(refreshed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan kartu kontak.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  const cardURL = username ? `https://jeonme.com/card/${username}` : "";

  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-2xl font-bold text-ink">Kartu Kontak Digital</h1>
      <p className="mt-1 text-sm text-muted">
        Kartu kontak terpisah dari halaman utamamu -- bagikan lewat kode QR, pengunjung bisa langsung menyimpan
        kontakmu ke ponsel (format vCard, kompatibel dengan Kontak iOS &amp; Android) dan (opsional) membagikan
        kontaknya balik ke kamu.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Kartu kontak disimpan.</p>}

      {card.is_active && username && (
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white py-2.5 text-sm font-semibold text-ink hover:border-primary hover:text-primary"
        >
          <IconQrCode className="h-4 w-4" />
          Lihat &amp; Unduh Kode QR Kartu
        </button>
      )}

      <form onSubmit={handleSave} className="mt-4 flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Aktifkan Kartu Kontak</p>
            <p className="text-xs text-muted">Kartu bisa diakses publik lewat jeonme.com/card/{username} kalau aktif.</p>
          </div>
          <Toggle
            checked={card.is_active}
            onChange={() => setCard({ ...card, is_active: !card.is_active })}
            label="Aktifkan kartu kontak"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Nama Lengkap</label>
          <input
            type="text"
            value={card.full_name}
            onChange={(e) => setCard({ ...card, full_name: e.target.value })}
            maxLength={200}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Jabatan</label>
            <input
              type="text"
              value={card.job_title}
              onChange={(e) => setCard({ ...card, job_title: e.target.value })}
              maxLength={200}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Perusahaan</label>
            <input
              type="text"
              value={card.company}
              onChange={(e) => setCard({ ...card, company: e.target.value })}
              maxLength={200}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Telepon</label>
            <input
              type="text"
              value={card.phone}
              onChange={(e) => setCard({ ...card, phone: e.target.value })}
              maxLength={30}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">WhatsApp</label>
            <input
              type="text"
              value={card.whatsapp_number}
              onChange={(e) => setCard({ ...card, whatsapp_number: e.target.value })}
              maxLength={30}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Email</label>
          <input
            type="email"
            value={card.email}
            onChange={(e) => setCard({ ...card, email: e.target.value })}
            maxLength={255}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-ink">Website</label>
          <input
            type="text"
            value={card.website}
            onChange={(e) => setCard({ ...card, website: e.target.value })}
            placeholder="https://..."
            maxLength={500}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-ink">Terima Kontak Balik</p>
            <p className="text-xs text-muted">Pengunjung yang scan bisa membagikan nama &amp; kontaknya ke kamu.</p>
          </div>
          <Toggle
            checked={card.collect_contact_back}
            onChange={() => setCard({ ...card, collect_contact_back: !card.collect_contact_back })}
            label="Terima kontak balik"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="btn-primary rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </form>

      {qrOpen && username && (
        <QRCodeModal
          url={cardURL}
          username={`card-${username}`}
          onClose={() => setQrOpen(false)}
          title="Kode QR Kartu Kontak"
          description="Cetak di kartu nama, banner booth, atau materi promosi offline supaya pengunjung bisa langsung scan."
        />
      )}
    </div>
  );
}
