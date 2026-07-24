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
  IconInbox,
  IconPlus,
  IconSparkle,
  IconTrash,
  IconUpload,
} from "@/components/icons";
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
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, has_file: true } : p)));
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
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="max-w-3xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Produk</h1>
        <p className="mt-1 text-sm text-muted">
          Unggah file (pdf/zip/epub/mp4/mp3/mov/gambar, maks 100MB) sebelum mengaktifkan produk.
          Tambahkan sampul (jpg/png/webp, maks 5MB) supaya tampil menarik di halaman publik.
        </p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((p) => (
            <div
              key={p.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card transition-shadow hover:shadow-card-hover"
            >
              <div className="relative aspect-[4/3] w-full bg-primary-subtle">
                {p.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-primary/40">
                    <IconBox className="h-10 w-10" />
                  </div>
                )}

                <span
                  className={`absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${
                    p.is_active ? "bg-secondary text-white" : "bg-white/90 text-muted"
                  }`}
                >
                  {p.is_active ? "Aktif" : "Belum aktif"}
                </span>
                {p.is_flash_sale_active && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    Flash Sale
                  </span>
                )}

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
                <button
                  type="button"
                  disabled={coverBusyId === p.id}
                  onClick={() => coverInputRefs.current[p.id]?.click()}
                  className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-full bg-ink/70 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur transition-colors hover:bg-ink/85 disabled:opacity-60"
                >
                  <IconCamera className="h-3.5 w-3.5" />
                  {coverBusyId === p.id ? "Mengunggah..." : p.cover_image_url ? "Ganti sampul" : "Tambah sampul"}
                </button>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                {p.is_flash_sale_active ? (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-xs text-muted line-through">Rp {p.price_idr.toLocaleString("id-ID")}</p>
                    <p className="text-sm font-bold text-accent-dark">
                      Rp {p.effective_price_idr.toLocaleString("id-ID")}
                    </p>
                  </div>
                ) : (
                  <p className="mt-0.5 text-sm font-bold text-secondary-dark">Rp {p.price_idr.toLocaleString("id-ID")}</p>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={p.is_active}
                      onChange={() => handleToggleActive(p)}
                      disabled={!p.has_file && !p.is_active}
                      label={`Aktifkan ${p.name}`}
                    />
                    <span className="text-xs font-semibold text-muted">Aktif</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {p.has_file && (
                      <button
                        type="button"
                        onClick={() => handleGetDownloadLink(p.id)}
                        title="Lihat file"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary-dark hover:bg-secondary-subtle"
                      >
                        <IconExternal className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      title="Hapus produk"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>

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
                  className={`mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                    p.has_file
                      ? "border border-border text-ink hover:border-primary hover:text-primary"
                      : "btn-primary text-white"
                  }`}
                >
                  {p.has_file ? <IconCheck className="h-3.5 w-3.5" /> : <IconUpload className="h-3.5 w-3.5" />}
                  {busyId === p.id ? "Mengunggah..." : p.has_file ? "File terunggah -- ganti" : "Unggah file produk"}
                </button>

                {flashSaleEditId === p.id ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
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
                ) : p.is_flash_sale_active ? (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-accent-dark">
                      Flash sale sampai{" "}
                      {p.flash_sale_ends_at && new Date(p.flash_sale_ends_at).toLocaleString("id-ID")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleClearFlashSale(p)}
                      className="text-[11px] font-bold text-red-600 hover:underline"
                    >
                      Batalkan
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFlashSaleForm(p)}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-bold text-ink hover:border-accent hover:text-accent-dark"
                  >
                    <IconSparkle className="h-3.5 w-3.5" />
                    Jadwalkan Flash Sale
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Kartu "tambah produk" -- selalu jadi item terakhir di grid,
              lebih mudah ditemukan daripada form terpisah di bawah daftar. */}
          {adding ? (
            <form
              onSubmit={handleCreate}
              className="flex flex-col justify-center gap-2.5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary-subtle/40 p-4"
            >
              <input
                type="text"
                autoFocus
                required
                placeholder="Nama produk"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <input
                type="number"
                required
                placeholder="Harga (IDR)"
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setName("");
                    setPriceIDR("");
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
                  {creating ? "Membuat..." : "Buat"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <IconPlus className="h-6 w-6" />
              <span className="text-sm font-semibold">Tambah Produk</span>
            </button>
          )}
        </div>

        {products.length === 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-4 text-sm text-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            Belum ada produk -- klik &quot;Tambah Produk&quot; di atas untuk membuat yang pertama.
          </div>
        )}
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}
