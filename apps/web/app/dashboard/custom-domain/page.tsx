"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DomainSettings,
  deleteDomainSettings,
  getDomainSettings,
  setDomainSettings,
  verifyDomainSettings,
} from "@/lib/api-client";
import { IconCheck, IconCopy } from "@/components/icons";

export default function DashboardCustomDomainPage() {
  const [settings, setSettings] = useState<DomainSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [domainInput, setDomainInput] = useState("");

  useEffect(() => {
    getDomainSettings()
      .then((s) => {
        setSettings(s);
        setDomainInput(s.domain);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat pengaturan domain."))
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(value: string, key: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  async function handleSetDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!domainInput.trim()) return;
    setError(null);
    setVerifyMessage(null);
    setSaving(true);
    try {
      const updated = await setDomainSettings(domainInput.trim());
      setSettings(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan domain.");
    } finally {
      setSaving(false);
    }
  }

  async function handleVerify() {
    setError(null);
    setVerifyMessage(null);
    setVerifying(true);
    try {
      const res = await verifyDomainSettings();
      setSettings(res.domain_settings);
      setVerifyMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memverifikasi domain.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    if (!settings || !window.confirm(`Lepas domain kustom "${settings.domain}"?`)) return;
    setError(null);
    try {
      await deleteDomainSettings();
      setSettings({ domain: "", verified: false, verification_token: "", cname_target: settings.cname_target, txt_record_name: "" });
      setDomainInput("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal melepas domain.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mt-1 text-sm text-muted">
        Arahkan domainmu sendiri (mis. toko.namamu.com) ke halaman Jeonme-mu. Fitur PRO di kompetitor -- gratis di
        Jeonme.
      </p>
      <p className="mt-2 rounded-lg bg-accent-subtle px-3 py-2 text-xs text-accent-dark">
        Versi awal: bagian pengaturan & verifikasi domain sudah bisa dipakai. Domainmu belum bisa benar-benar
        menampilkan halaman sampai infrastruktur server selesai disiapkan tim Jeonme.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <form onSubmit={handleSetDomain} className="flex gap-2">
          <input
            type="text"
            placeholder="toko.namamu.com"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={saving}
            className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </form>

        {settings?.domain && (
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${settings.verified ? "bg-secondary" : "bg-muted"}`} />
              <span className={`text-xs font-semibold ${settings.verified ? "text-secondary-dark" : "text-muted"}`}>
                {settings.verified ? "Terverifikasi" : "Belum terverifikasi"}
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                Tambahkan 2 DNS record berikut di penyedia domainmu
              </p>
              <div className="flex flex-col gap-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted">CNAME</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-ink">
                      {settings.domain} &rarr; {settings.cname_target}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(settings.cname_target, "cname")}
                      className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary"
                    >
                      <IconCopy className="h-3 w-3" />
                      {copied === "cname" ? "Tersalin!" : "Salin"}
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted">TXT</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-ink">
                      {settings.txt_record_name} = {settings.verification_token}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopy(settings.verification_token, "txt")}
                      className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary"
                    >
                      <IconCopy className="h-3 w-3" />
                      {copied === "txt" ? "Tersalin!" : "Salin"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {verifyMessage && (
              <p
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                  settings.verified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {verifyMessage}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifying}
                className="btn-primary flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                <IconCheck className="h-4 w-4" />
                {verifying ? "Memeriksa DNS..." : "Verifikasi Sekarang"}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-red-600 hover:border-red-300"
              >
                Lepas
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
