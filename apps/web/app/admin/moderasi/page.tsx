"use client";

import { useEffect, useState } from "react";
import { Ban, Plus, ShieldAlert, Trash2 } from "lucide-react";
import {
  ApiError,
  BlockedKeyword,
  DomainVerdict,
  ModerationCategory,
  ModerationMatchType,
  createBlockedKeyword,
  deleteBlockedKeyword,
  deleteDomainVerdict,
  listBlockedKeywords,
  listDomainVerdicts,
  upsertDomainVerdict,
} from "@/lib/api-client";
import { IconInbox } from "@/components/icons";
import { useErrorToast } from "@/lib/use-error-toast";

const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  judi_online: "Judi online",
  konten_dewasa: "Konten dewasa",
  lainnya: "Lainnya",
};

// MATCH_TYPE_LABELS -- lihat komentar ModerationMatchType di api-client.ts:
// "domain_exact" ditambahkan 5 September 2026 setelah ditemukan "slot.com"
// (domain BARE tanpa hiasan apa pun) lolos moderasi -- substring longgar
// sengaja tidak dipakai utk kata generik satu-suku-kata spt "slot" supaya
// tidak salah blokir teks bebas yang kebetulan memuat kata itu.
const MATCH_TYPE_LABELS: Record<ModerationMatchType, string> = {
  substring: "Substring (di mana saja di URL/judul)",
  domain_exact: "Domain persis (hanya kalau domain PERSIS kata ini)",
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
  useErrorToast(error);

  const [newKeyword, setNewKeyword] = useState("");
  const [newKeywordCategory, setNewKeywordCategory] = useState<ModerationCategory>("judi_online");
  const [newKeywordMatchType, setNewKeywordMatchType] = useState<ModerationMatchType>("substring");
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
      await createBlockedKeyword(keyword, newKeywordCategory, newKeywordMatchType);
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

  if (loading) return <p className="text-sm text-app-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-app-ink">Moderasi Tautan</h1>
      <p className="mt-1 text-sm text-app-muted">
        Kelola kata kunci &amp; reputasi domain yang dipakai memblokir tautan judi online/konten dewasa saat kreator menyimpan link.
      </p>


      {/* Kata kunci */}
      <section className="mt-6">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-app-ink">
          <ShieldAlert className="h-4 w-4" />
          Kata Kunci Terblokir
        </h2>
        <p className="mt-1 text-xs text-app-muted">
          Dicek terhadap URL+judul tautan baru, hanya untuk domain yang belum pernah dilihat sebelumnya.
        </p>

        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddKeyword()}
            placeholder="mis. slot gacor"
            className="min-w-0 rounded-lg border border-app-border px-3 py-1.5 text-sm lg:min-w-[160px] lg:flex-1"
          />
          <select
            value={newKeywordCategory}
            onChange={(e) => setNewKeywordCategory(e.target.value as ModerationCategory)}
            className="bg-app-surface text-app-ink min-w-0 rounded-lg border border-app-border px-2 py-1.5 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={newKeywordMatchType}
            onChange={(e) => setNewKeywordMatchType(e.target.value as ModerationMatchType)}
            title="Substring: cocok kalau kata ini muncul di mana pun dalam URL/judul (aman utk frasa spesifik multi-kata). Domain persis: HANYA cocok kalau domainnya PERSIS kata ini (aman utk kata generik satu-suku-kata spt 'slot')."
            className="bg-app-surface text-app-ink min-w-0 rounded-lg border border-app-border px-2 py-1.5 text-sm"
          >
            {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddKeyword}
            disabled={savingKeyword || !newKeyword.trim()}
            className="flex flex-shrink-0 items-center justify-center gap-1 rounded-lg btn-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah
          </button>
        </div>

      {/* Tabel ringkas (audit UI/UX admin, 17 September 2026) --
          MENGGANTIKAN kartu penuh-border per baris: bisa tumbuh sampai
          puluhan/ratusan kata kunci, pola kartu boros ruang & lebih
          lambat disisir dibanding tabel padat -- pola sama yang sudah
          dipakai /admin/traffic-sources & /admin/users. */}
        <div className="mt-3 overflow-x-auto rounded-jmd border-2 border-jeon-ink bg-app-surface">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <tbody className="divide-y divide-app-border">
              {keywords.map((k) => (
                <tr key={k.id} className="hover:bg-app-surface-2/60">
                  <td className="px-3 py-2 font-mono text-app-ink">{k.keyword}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border-2 border-[#111111] bg-jeon-coral px-2 py-0.5 text-[11px] font-semibold text-[#111111]">
                      {CATEGORY_LABELS[k.category] ?? k.category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {k.match_type === "domain_exact" && (
                      <span
                        title={MATCH_TYPE_LABELS.domain_exact}
                        className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-2 py-0.5 text-[11px] font-semibold text-[#111111]"
                      >
                        Domain persis
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteKeyword(k.id)}
                      title="Hapus kata kunci"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keywords.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-app-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada kata kunci.
            </div>
          )}
        </div>
      </section>

      {/* Reputasi domain */}
      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-display text-base font-bold text-app-ink">
          <Ban className="h-4 w-4" />
          Reputasi Domain
        </h2>
        <p className="mt-1 text-xs text-app-muted">
          Cache keputusan per domain -- dikurasi admin manual di sini, atau hasil klasifikasi otomatis (kata kunci/AI) yang bisa ditinjau/dibatalkan di sini.
        </p>

        <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:flex-wrap">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
            placeholder="mis. contoh-judol.com"
            className="min-w-0 rounded-lg border border-app-border px-3 py-1.5 text-sm lg:min-w-[160px] lg:flex-1"
          />
          <select
            value={newDomainCategory}
            onChange={(e) => setNewDomainCategory(e.target.value as ModerationCategory)}
            className="bg-app-surface text-app-ink min-w-0 rounded-lg border border-app-border px-2 py-1.5 text-sm"
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
            className="flex flex-shrink-0 items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
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
                domainFilter === f ? "btn-primary text-white" : "border-2 border-jeon-ink text-app-muted hover:border-jeon-purple"
              }`}
            >
              {f === "blocked" ? "Diblokir" : f === "allowed" ? "Diizinkan" : "Semua"}
            </button>
          ))}
        </div>

        <div className="mt-3 overflow-x-auto rounded-jmd border-2 border-jeon-ink bg-app-surface">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <tbody className="divide-y divide-app-border">
              {domains.map((d) => (
                <tr key={d.id} className="hover:bg-app-surface-2/60">
                  <td className="min-w-0 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-app-ink">{d.domain}</span>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          d.verdict === "blocked" ? "border-2 border-[#111111] bg-jeon-coral text-[#111111]" : "bg-green-50 text-[#111111]"
                        }`}
                      >
                        {d.verdict === "blocked" ? "Diblokir" : "Diizinkan"}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-app-muted">
                      {SOURCE_LABELS[d.source]}
                      {d.category && ` · ${CATEGORY_LABELS[d.category]}`}
                      {d.reason && ` · ${d.reason}`}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteDomain(d.id)}
                      title="Hapus entri (dievaluasi ulang di percobaan berikutnya)"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-app-muted hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {domains.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-app-muted">
              <IconInbox className="h-4 w-4 flex-shrink-0" />
              Belum ada entri.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
