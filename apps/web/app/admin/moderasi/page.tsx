"use client";

import { useEffect, useState } from "react";
import { Ban, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  ApiError,
  BlockedKeyword,
  DomainVerdict,
  ModerationCategory,
  createBlockedKeyword,
  deleteBlockedKeyword,
  deleteDomainVerdict,
  listBlockedKeywords,
  listDomainVerdicts,
  upsertDomainVerdict,
} from "@/lib/api-client";
import { IconInbox } from "@/components/icons";

const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  judi_online: "Judi online",
  konten_dewasa: "Konten dewasa",
  lainnya: "Lainnya",
};

const SOURCE_LABELS: Record<DomainVerdict["source"], string> = {
  manual: "Admin (manual)",
  keyword: "Otomatis (kata kunci)",
  ai: "Otomatis (AI)",
};

// Halaman Moderasi Tautan -- permintaan langsung pengguna, 22 Agustus
// 2026: "sistem bisa memblokir jika memasukkan link yang sensitif contoh
// nya link judol link 18+ dll". Mengelola dua sumber data yang dipakai
// handlers.LinkModerationChecker (backend, lihat internal/handlers/
// moderation.go): kata kunci yang dicek terhadap URL+judul tautan BARU
// dari domain yang belum pernah dilihat, dan cache reputasi per-domain
// (baik kurasi admin manual di sini MAUPUN hasil klasifikasi AI otomatis
// yang bisa ditinjau/dibatalkan di sini juga).
export default function AdminModerationPage() {
  const [keywords, setKeywords] = useState<BlockedKeyword[]>([]);
  const [domains, setDomains] = useState<DomainVerdict[]>([]);
  const [domainFilter, setDomainFilter] = useState<"blocked" | "allowed" | undefined>("blocked");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newKeyword, setNewKeyword] = useState("");
  const [newKeywordCategory, setNewKeywordCategory] = useState<ModerationCategory>("judi_online");
  const [savingKeyword, setSavingKeyword] = useState(false);

  const [newDomain, setNewDomain] = useState("");
  const [newDomainCategory, setNewDomainCategory] = useState<ModerationCategory>("judi_online");
  const [savingDomain, setSavingDomain] = useState(false);

  function reloadKeywords() {
    return listBlockedKeywords().then(setKeywords);
  }

  function reloadDomains(filter: "blocked" | "allowed" | undefined) {
    return listDomainVerdicts(filter).then(setDomains);
  }

  useEffect(() => {
    Promise.all([reloadKeywords(), reloadDomains(domainFilter)])
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data moderasi."))
      .finally(() => setLoading(false));
    // Sengaja HANYA sekali saat mount (nilai awal domainFilter, "blocked")
    // -- perubahan filter berikutnya ditangani efek kedua di bawah, jangan
    // dobel fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reloadDomains(domainFilter).catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat reputasi domain."));
  }, [domainFilter]);

  async function handleAddKeyword() {
    const keyword = newKeyword.trim();
    if (!keyword) return;
    setSavingKeyword(true);
    setError(null);
    try {
      await createBlockedKeyword(keyword, newKeywordCategory);
      setNewKeyword("");
      await reloadKeywords();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah kata kunci.");
    } finally {
      setSavingKeyword(false);
    }
  }

  async function handleDeleteKeyword(id: string) {
    setError(null);
    try {
      await deleteBlockedKeyword(id);
      await reloadKeywords();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus kata kunci.");
    }
  }

  async function handleAddDomain() {
    const domain = newDomain.trim();
    if (!domain) return;
    setSavingDomain(true);
    setError(null);
    try {
      await upsertDomainVerdict(domain, "blocked", newDomainCategory);
      setNewDomain("");
      await reloadDomains(domainFilter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memblokir domain.");
    } finally {
      setSavingDomain(false);
    }
  }

  async function handleDeleteDomain(id: string) {
    setError(null);
    try {
      await deleteDomainVerdict(id);
      await reloadDomains(domainFilter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus entri domain.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Moderasi Tautan</h1>
      <p className="mt-1 text-sm text-muted">
        Kelola kata kunci &amp; reputasi domain yang dipakai memblokir tautan judi online/konten dewasa saat kreator menyimpan link.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {/* Kata kunci */}
      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-bold text-ink">
          <ShieldAlert className="h-4 w-4" />
          Kata Kunci Terblokir
        </h2>
        <p className="mt-1 text-xs text-muted">
          Dicek terhadap URL+judul tautan baru, hanya untuk domain yang belum pernah dilihat sebelumnya.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
            placeholder="mis. slot gacor"
            className="flex-1 min-w-[160px] rounded-lg border border-border px-3 py-1.5 text-sm"
          />
          <select
            value={newKeywordCategory}
            onChange={(e) => setNewKeywordCategory(e.target.value as ModerationCategory)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddKeyword}
            disabled={savingKeyword || !newKeyword.trim()}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {keywords.map((k) => (
            <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-ink">
                <span className="font-mono">{k.keyword}</span>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                  {CATEGORY_LABELS[k.category] ?? k.category}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteKeyword(k.id)}
                title="Hapus kata kunci"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {keywords.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-sm text-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada kata kunci.
            </div>
          )}
        </div>
      </section>

      {/* Reputasi domain */}
      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-heading text-base font-bold text-ink">
          <Ban className="h-4 w-4" />
          Reputasi Domain
        </h2>
        <p className="mt-1 text-xs text-muted">
          Cache keputusan per domain -- dikurasi admin manual di sini, atau hasil klasifikasi otomatis (kata kunci/AI) yang bisa ditinjau/dibatalkan di sini.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            placeholder="mis. contoh-judol.com"
            className="flex-1 min-w-[160px] rounded-lg border border-border px-3 py-1.5 text-sm"
          />
          <select
            value={newDomainCategory}
            onChange={(e) => setNewDomainCategory(e.target.value as ModerationCategory)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddDomain}
            disabled={savingDomain || !newDomain.trim()}
            className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" />
            Blokir domain
          </button>
        </div>

        <div className="mt-3 flex gap-2 text-xs">
          {(["blocked", "allowed", undefined] as const).map((f) => (
            <button
              key={f ?? "all"}
              type="button"
              onClick={() => setDomainFilter(f)}
              className={`rounded-full px-3 py-1 font-semibold ${
                domainFilter === f ? "bg-primary text-white" : "border border-border text-muted hover:border-primary"
              }`}
            >
              {f === "blocked" ? "Diblokir" : f === "allowed" ? "Diizinkan" : "Semua"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-1.5">
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <span className="truncate font-mono">{d.domain}</span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      d.verdict === "blocked" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
                    }`}
                  >
                    {d.verdict === "blocked" ? "Diblokir" : "Diizinkan"}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {SOURCE_LABELS[d.source]}
                  {d.category && ` · ${CATEGORY_LABELS[d.category]}`}
                  {d.reason && ` · ${d.reason}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteDomain(d.id)}
                title="Hapus entri (dievaluasi ulang di percobaan berikutnya)"
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {domains.length === 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-6 text-sm text-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada entri.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
