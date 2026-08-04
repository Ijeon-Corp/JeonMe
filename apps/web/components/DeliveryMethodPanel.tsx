"use client";

import { useState } from "react";
import {
  ApiError,
  DashboardProduct,
  ProductCode,
  addProductCodes,
  deleteProductCode,
  getProductWebhookSecret,
  listProductCodes,
  updateProduct,
} from "@/lib/api-client";
import { IconCheck, IconCopy, IconTrash } from "@/components/icons";

// Modul Toko (Fase C): 4 metode penyerahan produk digital -- lihat catatan
// lingkup lengkap di migrasi 000047 & product.go. Komponen ini SENGAJA
// mandiri (bukan state products/page.tsx yang sudah sangat panjang) --
// dipakai di dalam modal "Kelola" per produk.
const METHOD_OPTIONS: { value: DashboardProduct["delivery_method"]; label: string; description: string }[] = [
  { value: "download_link", label: "Download Link", description: "Pembeli mengunduh file yang kamu unggah (default, sudah ada)." },
  { value: "manual", label: "Manual", description: "Kamu proses & kirim sendiri lewat kanal lain (WhatsApp/email)." },
  { value: "random_code", label: "Kode Acak", description: "Satu kode unik dari stokmu diklaim otomatis tiap pembelian." },
  { value: "webhook", label: "Webhook", description: "Server kamu diberi tahu otomatis (POST) saat pesanan lunas." },
];

// CATATAN: pemanggil WAJIB memberi `key={product.id}` -- komponen ini
// menyimpan draft lokal (URL webhook, daftar kode) yang harus RESET total
// begitu produk yang dibuka di modal "Kelola" berganti, jadi disandarkan
// ke remount lewat key (idiom React), bukan useEffect yang mereset state
// secara sinkron.
export default function DeliveryMethodPanel({
  product,
  onUpdated,
  onError,
}: {
  product: DashboardProduct;
  onUpdated: (patch: Partial<DashboardProduct>) => void;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [webhookUrlDraft, setWebhookUrlDraft] = useState(product.webhook_url);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  const [codes, setCodes] = useState<ProductCode[] | null>(null);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [newCodesText, setNewCodesText] = useState("");
  const [addingCodes, setAddingCodes] = useState(false);

  async function handleChangeMethod(method: DashboardProduct["delivery_method"]) {
    setSaving(true);
    try {
      await updateProduct(product.id, { delivery_method: method });
      onUpdated({ delivery_method: method });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal mengubah metode penyerahan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWebhookUrl() {
    setSaving(true);
    try {
      await updateProduct(product.id, { webhook_url: webhookUrlDraft.trim() });
      onUpdated({ webhook_url: webhookUrlDraft.trim() });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal menyimpan URL webhook.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevealSecret() {
    setLoadingSecret(true);
    try {
      const { webhook_secret } = await getProductWebhookSecret(product.id);
      setWebhookSecret(webhook_secret);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal memuat kunci webhook.");
    } finally {
      setLoadingSecret(false);
    }
  }

  function handleCopySecret() {
    if (!webhookSecret) return;
    navigator.clipboard.writeText(webhookSecret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function loadCodes() {
    setLoadingCodes(true);
    try {
      setCodes(await listProductCodes(product.id));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal memuat daftar kode.");
    } finally {
      setLoadingCodes(false);
    }
  }

  async function handleAddCodes() {
    const parsed = newCodesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsed.length === 0) return;
    setAddingCodes(true);
    try {
      const res = await addProductCodes(product.id, parsed);
      setNewCodesText("");
      onUpdated({ unclaimed_code_count: product.unclaimed_code_count + res.added });
      await loadCodes();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal menambahkan kode.");
    } finally {
      setAddingCodes(false);
    }
  }

  async function handleDeleteCode(codeId: string) {
    try {
      await deleteProductCode(product.id, codeId);
      setCodes((prev) => (prev ? prev.filter((c) => c.id !== codeId) : prev));
      onUpdated({ unclaimed_code_count: Math.max(0, product.unclaimed_code_count - 1) });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal menghapus kode.");
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <p className="text-[11px] font-bold text-ink">Metode Penyerahan</p>
      <select
        value={product.delivery_method}
        disabled={saving}
        onChange={(e) => handleChangeMethod(e.target.value as DashboardProduct["delivery_method"])}
        className="mt-1.5 w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none disabled:opacity-60"
      >
        {METHOD_OPTIONS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] text-muted">
        {METHOD_OPTIONS.find((m) => m.value === product.delivery_method)?.description}
      </p>

      {product.delivery_method === "webhook" && (
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex gap-1.5">
            <input
              type="url"
              placeholder="https://server-kamu.com/webhook"
              value={webhookUrlDraft}
              onChange={(e) => setWebhookUrlDraft(e.target.value)}
              className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveWebhookUrl}
              className="btn-primary rounded-md px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
            >
              Simpan
            </button>
          </div>
          {webhookSecret ? (
            <div className="flex items-center gap-1.5 rounded-md bg-primary-subtle/40 px-2.5 py-1.5">
              <code className="min-w-0 flex-1 truncate text-[10px] text-ink">{webhookSecret}</code>
              <button type="button" onClick={handleCopySecret} className="flex-shrink-0 text-primary" title="Salin">
                {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={loadingSecret}
              onClick={handleRevealSecret}
              className="self-start text-[11px] font-semibold text-primary hover:underline disabled:opacity-60"
            >
              {loadingSecret ? "Memuat..." : "Lihat kunci tanda tangan (HMAC)"}
            </button>
          )}
          <p className="text-[10px] text-muted">
            Tiap POST ditandatangani di header <code>X-Jeonme-Signature</code> (HMAC-SHA256 dari isi body) supaya
            server kamu bisa memverifikasi pengirimnya benar-benar Jeonme.
          </p>
        </div>
      )}

      {product.delivery_method === "random_code" && (
        <div className="mt-2.5 flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-ink">
            Stok tersedia: <span className="text-secondary-dark">{product.unclaimed_code_count}</span>
          </p>
          <textarea
            placeholder={"Tempel kode, satu per baris\nCONTOH-KODE-1\nCONTOH-KODE-2"}
            value={newCodesText}
            onChange={(e) => setNewCodesText(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={addingCodes || !newCodesText.trim()}
            onClick={handleAddCodes}
            className="btn-primary self-start rounded-md px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {addingCodes ? "Menambahkan..." : "Tambah Kode"}
          </button>

          {codes === null ? (
            <button type="button" onClick={loadCodes} disabled={loadingCodes} className="self-start text-[11px] font-semibold text-primary hover:underline">
              {loadingCodes ? "Memuat..." : "Lihat daftar kode"}
            </button>
          ) : (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {codes.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border px-2.5 py-1.5 text-[11px] last:border-0">
                  <span className={`truncate ${c.claimed_at ? "text-muted line-through" : "text-ink"}`}>{c.code}</span>
                  {c.claimed_at ? (
                    <span className="flex-shrink-0 text-[9px] font-bold text-muted">Terpakai</span>
                  ) : (
                    <button type="button" onClick={() => handleDeleteCode(c.id)} className="flex-shrink-0 text-red-600 hover:bg-red-50">
                      <IconTrash className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {codes.length === 0 && <p className="px-2.5 py-2 text-center text-[11px] text-muted">Belum ada kode.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
