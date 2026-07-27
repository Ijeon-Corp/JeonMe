"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  createProduct,
  deleteProduct,
  getMyPage,
  getProductDownloadURL,
  listLinks,
  listProducts,
  updateProduct,
  uploadProductCover,
  uploadProductFile,
} from "@/lib/api-client";
import {
  IconBox,
  IconCamera,
  IconCheck,
  IconExternal,
  IconPlus,
  IconShield,
  IconSparkle,
  IconTrash,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import LivePreviewPanel from "@/components/LivePreviewPanel";

export default function DashboardProductsPage() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [creating, setCreating] = useState(false);

  const [flashSaleEditId, setFlashSaleEditId] = useState<string | null>(null);
  const [flashPrice, setFlashPrice] = useState("");
  const [flashStart, setFlashStart] = useState("");
  const [flashEnd, setFlashEnd] = useState("");
  const [savingFlashSale, setSavingFlashSale] = useState(false);

  const [pwywEditId, setPwywEditId] = useState<string | null>(null);
  const [pwywMinPrice, setPwywMinPrice] = useState("");
  const [savingPwyw, setSavingPwyw] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const coverInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts()])
      .then(([p, l, prod]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama produk wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const created = await createProduct({ name, price_idr: price });
      setProducts((prev) => [
        ...prev,
        {
          id: created.id,
          name,
          description: "",
          price_idr: price,
          is_active: false,
          has_file: false,
          cover_image_url: "",
          flash_sale_price_idr: null,
          flash_sale_starts_at: null,
          flash_sale_ends_at: null,
          effective_price_idr: price,
          is_flash_sale_active: false,
          pwyw_enabled: false,
          pwyw_min_price_idr: null,
          watermark_enabled: false,
          is_pdf: false,
        },
      ]);
      setName("");
      setPriceIDR("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat produk.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpload(product: DashboardProduct, file: File) {
    setError(null);
    setBusyId(product.id);
    try {
      await uploadProductFile(product.id, file);
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, has_file: true, is_pdf: isPdf } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah file.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUploadCover(product: DashboardProduct, file: File) {
    setError(null);
    setCoverBusyId(product.id);
    try {
      const { cover_image_url } = await uploadProductCover(product.id, file);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, cover_image_url } : p)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah sampul.");
    } finally {
      setCoverBusyId(null);
    }
  }

  async function handleToggleActive(product: DashboardProduct) {
    if (!product.has_file && !product.is_active) {
      setError("Unggah file dulu sebelum mengaktifkan produk.");
      return;
    }
    const nextActive = !product.is_active;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p)));
    try {
      await updateProduct(product.id, { is_active: nextActive });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: product.is_active } : p)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status produk.");
    }
  }

  // No.85: watermark otomatis (email pembeli + ID pesanan) hanya berlaku
  // untuk file PDF -- lihat catatan lingkup di applyPdfWatermark backend.
  async function handleToggleWatermark(product: DashboardProduct) {
    const next = !product.watermark_enabled;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, watermark_enabled: next } : p)));
    try {
      await updateProduct(product.id, { watermark_enabled: next });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, watermark_enabled: product.watermark_enabled } : p)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui pengaturan watermark.");
    }
  }

  async function handleDelete(product: DashboardProduct) {
    if (!window.confirm(`Hapus produk "${product.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    try {
      await deleteProduct(product.id);
    } catch (err) {
      setProducts(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus produk.");
    }
  }

  function openFlashSaleForm(product: DashboardProduct) {
    setFlashSaleEditId(product.id);
    setFlashPrice(product.flash_sale_price_idr ? String(product.flash_sale_price_idr) : "");
    setFlashStart(product.flash_sale_starts_at ? product.flash_sale_starts_at.slice(0, 16) : "");
    setFlashEnd(product.flash_sale_ends_at ? product.flash_sale_ends_at.slice(0, 16) : "");
  }

  async function handleSaveFlashSale(product: DashboardProduct) {
    const flashPriceValue = Number(flashPrice);
    if (!flashPriceValue || flashPriceValue >= product.price_idr) {
      setError("Harga flash sale wajib diisi dan harus lebih murah dari harga produk.");
      return;
    }
    if (!flashStart || !flashEnd) {
      setError("Waktu mulai dan berakhir flash sale wajib diisi.");
      return;
    }
    const startsAt = new Date(flashStart).toISOString();
    const endsAt = new Date(flashEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("Waktu berakhir flash sale harus setelah waktu mulai.");
      return;
    }
    setError(null);
    setSavingFlashSale(true);
    try {
      await updateProduct(product.id, {
        flash_sale_price_idr: flashPriceValue,
        flash_sale_starts_at: startsAt,
        flash_sale_ends_at: endsAt,
      });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setFlashSaleEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menjadwalkan flash sale.");
    } finally {
      setSavingFlashSale(false);
    }
  }

  async function handleClearFlashSale(product: DashboardProduct) {
    setError(null);
    try {
      await updateProduct(product.id, { clear_flash_sale: true });
      const refreshed = await listProducts();
      setProducts(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan flash sale.");
    }
  }

  function openPwywForm(product: DashboardProduct) {
    setPwywEditId(product.id);
    setPwywMinPrice(product.pwyw_min_price_idr ? String(product.pwyw_min_price_idr) : "");
  }

  async function handleSavePwyw(product: DashboardProduct) {
    const minPrice = Number(pwywMinPrice);
    if (!minPrice || minPrice < 1000) {
      setError("Harga minimum wajib diisi, minimal Rp1.000.");
      return;
    }
    setError(null);
    setSavingPwyw(true);
    try {
      await updateProduct(product.id, { pwyw_enabled: true, pwyw_min_price_idr: minPrice });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setPwywEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengaktifkan bayar seikhlasnya.");
    } finally {
      setSavingPwyw(false);
    }
  }

  async function handleClearPwyw(product: DashboardProduct) {
    setError(null);
    try {
      await updateProduct(product.id, { pwyw_enabled: false });
      const refreshed = await listProducts();
      setProducts(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menonaktifkan bayar seikhlasnya.");
    }
  }

  async function handleGetDownloadLink(id: string) {
    setError(null);
    try {
      const { download_url } = await getProductDownloadURL(id);
      window.open(download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat tautan unduhan.");
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    // contentMaxWidth "max-w-3xl" DIHAPUS -- lihat catatan sama persis di
    // DesignPageShell.tsx/dashboard/links/page.tsx.
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink">Produk</h1>
        <p className="mt-1 text-sm text-muted">
          Unggah file (pdf/zip/epub/mp4/mp3/mov/gambar, maks 100MB) sebelum mengaktifkan produk.
          Tambahkan sampul (jpg/png/webp, maks 5MB) supaya tampil menarik di halaman publik.
        </p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {/* Redesain jadi baris kompak ala halaman Tautan (permintaan langsung
            pengguna: kartu grid sebelumnya dengan gambar sampul rasio 4:3
            lebar penuh terasa "size besar") -- thumbnail kecil di kiri,
            info+harga di tengah, sakelar+ikon aksi di kanan. Semua logika
            (flash sale/bayar seikhlasnya/watermark/unggah file) TIDAK
            diubah, cuma tata letaknya. */}
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-primary mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
          >
            <IconPlus className="h-5 w-5" />
            Tambah Produk
          </button>
        ) : (
          <form onSubmit={handleCreate} className="mt-6 flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-card sm:flex-row">
            <input
              type="text"
              autoFocus
              required
              placeholder="Nama produk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="number"
              required
              placeholder="Harga (IDR)"
              min={1000}
              value={priceIDR}
              onChange={(e) => setPriceIDR(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
              {creating ? "Membuat..." : "Buat"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setName("");
                setPriceIDR("");
              }}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted hover:border-ink/30"
            >
              Batal
            </button>
          </form>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {products.map((p) => (
            <li key={p.id} className="flex flex-col gap-2.5 rounded-2xl border border-border bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={coverBusyId === p.id}
                  onClick={() => coverInputRefs.current[p.id]?.click()}
                  title={p.cover_image_url ? "Ganti sampul" : "Tambah sampul"}
                  className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-primary-subtle disabled:opacity-60"
                >
                  {p.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-primary/40">
                      <IconBox className="h-6 w-6" />
                    </div>
                  )}
                  <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-ink/70 text-white">
                    <IconCamera className="h-2.5 w-2.5" />
                  </span>
                </button>
                <input
                  ref={(el) => {
                    coverInputRefs.current[p.id] = el;
                  }}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCover(p, file);
                    e.target.value = "";
                  }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        p.is_active ? "bg-secondary-subtle text-secondary-dark" : "bg-gray-100 text-muted"
                      }`}
                    >
                      {p.is_active ? "Aktif" : "Belum aktif"}
                    </span>
                    {p.is_flash_sale_active && (
                      <span className="flex-shrink-0 rounded-full bg-accent-subtle px-2 py-0.5 text-[10px] font-bold text-accent-dark">
                        Flash Sale
                      </span>
                    )}
                  </div>
                  {p.pwyw_enabled ? (
                    <p className="mt-0.5 text-xs font-bold text-secondary-dark">
                      Mulai dari Rp {(p.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")}
                    </p>
                  ) : p.is_flash_sale_active ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-[11px] text-muted line-through">Rp {p.price_idr.toLocaleString("id-ID")}</p>
                      <p className="text-xs font-bold text-accent-dark">Rp {p.effective_price_idr.toLocaleString("id-ID")}</p>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs font-bold text-secondary-dark">Rp {p.price_idr.toLocaleString("id-ID")}</p>
                  )}
                </div>

                <Toggle
                  checked={p.is_active}
                  onChange={() => handleToggleActive(p)}
                  disabled={!p.has_file && !p.is_active}
                  label={`Aktifkan ${p.name}`}
                />
              </div>

              <div className="ml-[68px] flex items-center gap-1">
                <input
                  ref={(el) => {
                    fileInputRefs.current[p.id] = el;
                  }}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(p, file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => fileInputRefs.current[p.id]?.click()}
                  title={p.has_file ? "File terunggah -- ganti" : "Unggah file produk"}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg disabled:opacity-60 ${
                    p.has_file ? "text-secondary-dark hover:bg-secondary-subtle" : "text-primary hover:bg-primary-subtle"
                  }`}
                >
                  {p.has_file ? <IconCheck className="h-4 w-4" /> : <IconUpload className="h-4 w-4" />}
                </button>
                {p.has_file && (
                  <button
                    type="button"
                    onClick={() => handleGetDownloadLink(p.id)}
                    title="Lihat file"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-primary-subtle"
                  >
                    <IconExternal className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openFlashSaleForm(p)}
                  title="Flash Sale"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                    p.is_flash_sale_active ? "text-accent-dark" : "text-muted"
                  }`}
                >
                  <IconSparkle className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openPwywForm(p)}
                  title="Bayar Seikhlasnya"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                    p.pwyw_enabled ? "text-secondary-dark" : "text-muted"
                  }`}
                >
                  <IconWallet className="h-4 w-4" />
                </button>
                {p.is_pdf && (
                  <button
                    type="button"
                    onClick={() => handleToggleWatermark(p)}
                    title="Watermark otomatis (email pembeli + ID pesanan)"
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                      p.watermark_enabled ? "text-primary" : "text-muted"
                    }`}
                  >
                    <IconShield className="h-4 w-4" />
                  </button>
                )}
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  title="Hapus produk"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>

              {flashSaleEditId === p.id ? (
                <div className="ml-[68px] flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                  <input
                    type="number"
                    placeholder="Harga flash sale (Rp)"
                    value={flashPrice}
                    onChange={(e) => setFlashPrice(e.target.value)}
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="datetime-local"
                      value={flashStart}
                      onChange={(e) => setFlashStart(e.target.value)}
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <input
                      type="datetime-local"
                      value={flashEnd}
                      onChange={(e) => setFlashEnd(e.target.value)}
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFlashSaleEditId(null)}
                      className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={savingFlashSale}
                      onClick={() => handleSaveFlashSale(p)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingFlashSale ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              ) : (
                p.is_flash_sale_active && (
                  <div className="ml-[68px] flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-accent-dark">
                      Flash sale sampai {p.flash_sale_ends_at && new Date(p.flash_sale_ends_at).toLocaleString("id-ID")}
                    </span>
                    <button type="button" onClick={() => handleClearFlashSale(p)} className="text-[11px] font-bold text-red-600 hover:underline">
                      Batalkan
                    </button>
                  </div>
                )
              )}

              {pwywEditId === p.id ? (
                <div className="ml-[68px] flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                  <input
                    type="number"
                    placeholder="Harga minimum (Rp)"
                    value={pwywMinPrice}
                    onChange={(e) => setPwywMinPrice(e.target.value)}
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPwywEditId(null)}
                      className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={savingPwyw}
                      onClick={() => handleSavePwyw(p)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingPwyw ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              ) : (
                p.pwyw_enabled && (
                  <div className="ml-[68px] flex items-center justify-between rounded-lg bg-secondary-subtle px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-secondary-dark">
                      Bayar seikhlasnya aktif, min Rp{(p.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")}
                    </span>
                    <button type="button" onClick={() => handleClearPwyw(p)} className="text-[11px] font-bold text-red-600 hover:underline">
                      Batalkan
                    </button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>

        {products.length === 0 && (
          <EmptyState className="mt-4" text='Belum ada produk -- klik "Tambah Produk" di atas untuk membuat yang pertama.' />
        )}
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
