"use client";

import { useState } from "react";
import { ApiError, PublicBusinessCard, submitCardContact } from "@/lib/api-client";
import { IconDownload } from "@/components/icons";

// No.95 (Sprint 13): dua aksi utama kartu kontak sisi klien --
// (1) unduh vCard (.vcf) standar, dibuat di browser tanpa integrasi Wallet
// pihak ketiga apa pun (Apple/Google Wallet butuh kredensial developer yang
// belum ada -- lihat catatan lingkup di BusinessCardHandler backend);
// (2) formulir "bagikan kontak balik", muncul hanya kalau kreator
// mengaktifkan collect_contact_back.
function escapeVCard(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function buildVCard(card: PublicBusinessCard) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(card.full_name)}`];
  if (card.company) lines.push(`ORG:${escapeVCard(card.company)}`);
  if (card.job_title) lines.push(`TITLE:${escapeVCard(card.job_title)}`);
  if (card.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(card.phone)}`);
  if (card.whatsapp_number) lines.push(`TEL;TYPE=WORK:${escapeVCard(card.whatsapp_number)}`);
  if (card.email) lines.push(`EMAIL:${escapeVCard(card.email)}`);
  if (card.website) lines.push(`URL:${escapeVCard(card.website)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export default function CardActions({ card }: { card: PublicBusinessCard }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleDownloadVCard() {
    const blob = new Blob([buildVCard(card)], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${card.username}.vcf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmitContact(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !whatsapp.trim()) {
      setError("Isi email atau nomor WhatsApp.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitCardContact(card.username, { name: name.trim(), email: email.trim(), whatsapp_number: whatsapp.trim() });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membagikan kontak, coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <button
        type="button"
        onClick={handleDownloadVCard}
        className="btn-primary flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white"
      >
        <IconDownload className="h-4 w-4" />
        Simpan ke Kontak
      </button>

      {card.collect_contact_back && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          {done ? (
            <p className="text-sm font-semibold text-green-700">Terima kasih! Kontakmu sudah dibagikan.</p>
          ) : (
            <form onSubmit={handleSubmitContact} className="flex flex-col gap-2">
              <p className="text-sm font-bold text-ink">Bagikan kontakmu balik</p>
              {error && <p className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">{error}</p>}
              <input
                type="text"
                placeholder="Nama kamu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="text"
                placeholder="Nomor WhatsApp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="mt-1 rounded-lg border border-border py-2 text-sm font-bold text-ink hover:border-primary hover:text-primary disabled:opacity-60"
              >
                {submitting ? "Mengirim..." : "Bagikan"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
