"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  MyAffiliate,
  AffiliateProgram,
  listAffiliatePrograms,
  listMyAffiliates,
  listProducts,
  removeAffiliateCommission,
  revokeAffiliate,
  upsertAffiliate,
} from "@/lib/api-client";
import { IconCopy, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";

export default function DashboardAffiliatesPage() {
  const [affiliates, setAffiliates] = useState<MyAffiliate[]>([]);
  const [programs, setPrograms] = useState<AffiliateProgram[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("10");

  function loadAll() {
    return Promise.all([listMyAffiliates(), listAffiliatePrograms(), listProducts()]).then(
      ([a, p, prod]) => {
        setAffiliates(a);
        setPrograms(p);
        setProducts(prod);
      }
    );
  }

  useEffect(() => {
    loadAll()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat program afiliasi."))
      .finally(() => setLoading(false));
  }, []);

  function handleCopy(url: string, code: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1800);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const percent = Number(commissionPercent);
    if (!email.trim() || !productId || !percent || percent <= 0 || percent > 100) {
      setError("Email afiliator, produk, dan komisi (0.01-100%) wajib diisi dengan benar.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await upsertAffiliate({ affiliate_email: email.trim(), product_id: productId, commission_percent: percent });
      await loadAll();
      setEmail("");
      setProductId("");
      setCommissionPercent("10");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan afiliator.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(affiliateId: string, email: string) {
    if (!window.confirm(`Cabut ${email} sebagai afiliator? Tautan referralnya akan berhenti berfungsi.`)) return;
    try {
      await revokeAffiliate(affiliateId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mencabut afiliator.");
    }
  }

  async function handleRemoveCommission(affiliateId: string, productId: string) {
    try {
      await removeAffiliateCommission(affiliateId, productId);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus komisi.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Program Afiliasi</h1>
      <p className="mt-1 text-sm text-muted">
        Undang afiliator dengan komisi custom per produk. Versi awal: mode privat -- afiliator harus sudah jadi
        pengguna Jeonme.
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
            Undang Afiliator
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Email Afiliator</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="afiliator@email.com"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-[11px] text-muted">Harus sudah punya akun Jeonme dengan email ini.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Produk</label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Pilih produk...</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Rp {p.price_idr.toLocaleString("id-ID")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Komisi (%)</label>
              <input
                type="number"
                required
                min={0.01}
                max={100}
                step={0.01}
                value={commissionPercent}
                onChange={(e) => setCommissionPercent(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {affiliates.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">{a.affiliate_email}</p>
              <button
                type="button"
                onClick={() => handleRevoke(a.id, a.affiliate_email)}
                title="Cabut afiliator"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary-subtle/60 px-3 py-1.5">
              <p className="min-w-0 flex-1 truncate text-xs text-ink">
                {a.referral_base_url}?ref={a.referral_code}
              </p>
              <button
                type="button"
                onClick={() => handleCopy(`${a.referral_base_url}?ref=${a.referral_code}`, a.referral_code)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary"
              >
                <IconCopy className="h-3 w-3" />
                {copiedCode === a.referral_code ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {a.commissions.map((c) => (
                <div key={c.product_id} className="flex items-center justify-between text-xs">
                  <span className="text-ink">{c.product_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-secondary-dark">{c.commission_percent}%</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCommission(a.id, c.product_id)}
                      title="Hapus komisi produk ini"
                      className="text-muted hover:text-red-600"
                    >
                      <IconTrash className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {a.commissions.length === 0 && <p className="text-xs text-muted">Belum ada komisi produk.</p>}
            </div>
          </div>
        ))}

        {affiliates.length === 0 && (
          <EmptyState text='Belum ada afiliator -- klik "Undang Afiliator" di atas untuk mengundang yang pertama.' />
        )}
      </div>

      <h2 className="mt-10 font-heading text-lg font-bold text-ink">Saya Jadi Afiliator</h2>
      <p className="mt-1 text-sm text-muted">Program afiliasi kreator lain yang kamu ikuti.</p>

      <div className="mt-4 flex flex-col gap-3">
        {programs.map((p) => (
          <div key={p.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <p className="text-sm font-bold text-ink">@{p.creator_username}</p>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary-subtle/60 px-3 py-1.5">
              <p className="min-w-0 flex-1 truncate text-xs text-ink">{p.referral_url}</p>
              <button
                type="button"
                onClick={() => handleCopy(p.referral_url, p.referral_code)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[11px] font-semibold text-ink hover:border-primary"
              >
                <IconCopy className="h-3 w-3" />
                {copiedCode === p.referral_code ? "Tersalin!" : "Salin"}
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {p.commissions.map((c) => (
                <div key={c.product_id} className="flex items-center justify-between text-xs">
                  <span className="text-ink">{c.product_name}</span>
                  <span className="font-bold text-secondary-dark">{c.commission_percent}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {programs.length === 0 && <EmptyState text="Belum ada kreator yang mengundangmu sebagai afiliator." />}
      </div>
    </div>
  );
}
