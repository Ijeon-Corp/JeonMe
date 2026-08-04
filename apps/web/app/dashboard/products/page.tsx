"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnalyticsSummary,
  ApiError,
  CollaboratorSplit,
  DashboardCollaborator,
  DashboardProduct,
  LinkItem,
  MyPage,
  RecentOrder,
  createProduct,
  deleteProduct,
  getAnalyticsSummary,
  getMyPage,
  getProductDownloadURL,
  listCollaborators,
  listLinks,
  listProducts,
  listRecentOrders,
  updateProduct,
  uploadProductCover,
  uploadProductFile,
} from "@/lib/api-client";
import {
  IconBox,
  IconCamera,
  IconCheck,
  IconClose,
  IconExternal,
  IconPlus,
  IconSearch,
  IconShield,
  IconSparkle,
  IconTrash,
  IconUpload,
  IconUsers,
  IconWallet,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import ShopOverviewPanel from "@/components/ShopOverviewPanel";

// Modul Toko (permintaan langsung pengguna: "ikuti seluruh alur yang ada di
// gambar ini" -- referensi dashboard toko Overview + Manage Items. Prioritas
// dipilih lewat AskUserQuestion: "Overview + Manage Items dulu", dan format
// tabel (bukan format baris ringkas lama) juga dipilih eksplisit lewat
// AskUserQuestion kedua). Reviews/Listing/Voucher/Storage & Files/Webhook
// Events/Shop Settings dari gambar SENGAJA belum dikerjakan -- di luar
// prioritas yang dipilih.
//
// "Jenis Produk"/"Stok" dari gambar SENGAJA tidak ditiru -- List() backend
// cuma mengembalikan produk digital biasa (bundel/donasi/kelas/booking
// masing-masing sudah punya halaman kelola sendiri, lihat ProductHandler.List),
// jadi kolom "Jenis Produk" akan selalu sama untuk semua baris (tidak
// berguna); dan produk digital Jeonme tidak pernah dibatasi kuantitas (file
// diunduh berkali-kali), jadi "Stok" akan selalu palsu kalau dipaksakan.
// Kolom "Terjual" (sold_count, dihitung backend dari order status=paid)
// dipakai sebagai pengganti yang JUJUR dari data yang benar-benar ada.
export default function DashboardProductsPage() {
  const [tab, setTab] = useState<"overview" | "manage">("overview");

  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [creating, setCreating] = useState(false);

  // manageProductId -- Modul Toko: produk yang sedang dibuka di modal
  // "Kelola" (unggah file/sampul, flash sale, bayar seikhlasnya, split
  // kolaborator, hapus) -- SEBELUMNYA semua ini expand inline di tiap baris
  // kartu; dipindah ke modal supaya tabel tetap ringkas (permintaan
  // langsung pengguna: format tabel ala referensi).
  const [manageProductId, setManageProductId] = useState<string | null>(null);

  const [flashSaleEditId, setFlashSaleEditId] = useState<string | null>(null);
  const [flashPrice, setFlashPrice] = useState("");
  const [flashStart, setFlashStart] = useState("");
  const [flashEnd, setFlashEnd] = useState("");
  const [savingFlashSale, setSavingFlashSale] = useState(false);

  const [pwywEditId, setPwywEditId] = useState<string | null>(null);
  const [pwywMinPrice, setPwywMinPrice] = useState("");
  const [savingPwyw, setSavingPwyw] = useState(false);

  // Modul Settings §3: split kolaborator per produk -- HANYA kolaborator
  // yang sudah diundang & aktif (collaborator_user_id terisi), lihat
  // CollaboratorHandler.ListMine backend. Kreator memilih dari daftar,
  // bukan mengetik user_id.
  const [activeCollaborators, setActiveCollaborators] = useState<DashboardCollaborator[]>([]);
  const [splitsEditId, setSplitsEditId] = useState<string | null>(null);
  const [splitRows, setSplitRows] = useState<CollaboratorSplit[]>([]);
  const [savingSplits, setSavingSplits] = useState(false);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const coverInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts(), listCollaborators()])
      .then(([p, l, prod, collabs]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
        setActiveCollaborators(collabs.filter((c) => c.status === "active" && c.collaborator_user_id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([getAnalyticsSummary({ range_days: 30 }), listRecentOrders()])
      .then(([s, orders]) => {
        setSummary(s);
        setRecentOrders(orders);
      })
      .catch((err) => setOverviewError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan toko."));
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
          collaborator_splits: [],
          sold_count: 0,
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

  function closeManageModal() {
    setManageProductId(null);
    setFlashSaleEditId(null);
    setPwywEditId(null);
    setSplitsEditId(null);
  }

  async function handleDelete(product: DashboardProduct) {
    if (!window.confirm(`Hapus produk "${product.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    closeManageModal();
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

  function openSplitsForm(product: DashboardProduct) {
    setSplitsEditId(product.id);
    setSplitRows(product.collaborator_splits.length > 0 ? product.collaborator_splits : [{ user_id: "", percent: 0 }]);
  }

  function updateSplitRow(index: number, patch: Partial<CollaboratorSplit>) {
    setSplitRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleSaveSplits(product: DashboardProduct) {
    const rows = splitRows.filter((r) => r.user_id && r.percent > 0);
    setError(null);
    setSavingSplits(true);
    try {
      await updateProduct(product.id, { collaborator_splits: rows });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setSplitsEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan split kolaborator.");
    } finally {
      setSavingSplits(false);
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

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const manageProduct = products.find((p) => p.id === manageProductId) ?? null;

  return (
    // "max-w-3xl" (kolom konten) & "mx-auto max-w-6xl" (grid) DIHAPUS --
    // lihat catatan lengkap di DesignPageShell.tsx/dashboard/links/page.tsx.
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div>
        <div className="flex gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "overview" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("manage")}
            className={`border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "manage" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Manage Items
          </button>
        </div>

        {tab === "overview" ? (
          <div className="mt-4">
            {overviewError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{overviewError}</p>}
            {summary ? <ShopOverviewPanel summary={summary} recentOrders={recentOrders} /> : <p className="text-sm text-muted">Memuat...</p>}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted">
              Unggah file (pdf/zip/epub/mp4/mp3/mov/gambar, maks 100MB) sebelum mengaktifkan produk. Tambahkan sampul
              (jpg/png/webp, maks 5MB) supaya tampil menarik di halaman publik.
            </p>

            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-xs">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari produk..."
                  className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-xs focus:border-primary focus:outline-none"
                />
              </div>
              {!adding && (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="btn-primary flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Tambah Produk
                </button>
              )}
            </div>

            {adding && (
              <form onSubmit={handleCreate} className="mt-3 flex flex-col gap-2 rounded-2xl border border-border bg-white p-4 shadow-card sm:flex-row">
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

            {filteredProducts.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-white shadow-card">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Harga</th>
                      <th className="px-4 py-3">Terjual</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-subtle">
                              {p.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
                              ) : (
                                <IconBox className="h-4 w-4 text-primary/40" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">{p.name}</p>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {p.is_flash_sale_active && (
                                  <span className="rounded-full bg-accent-subtle px-1.5 py-0.5 text-[9px] font-bold text-accent-dark">Flash Sale</span>
                                )}
                                {p.pwyw_enabled && (
                                  <span className="rounded-full bg-secondary-subtle px-1.5 py-0.5 text-[9px] font-bold text-secondary-dark">
                                    Bayar Seikhlasnya
                                  </span>
                                )}
                                {p.collaborator_splits.length > 0 && (
                                  <span className="rounded-full bg-primary-subtle px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                    {p.collaborator_splits.length} kolaborator
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {p.pwyw_enabled ? (
                            <span className="font-bold text-secondary-dark">Min Rp {(p.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")}</span>
                          ) : p.is_flash_sale_active ? (
                            <span>
                              <span className="mr-1 text-muted line-through">Rp {p.price_idr.toLocaleString("id-ID")}</span>
                              <span className="font-bold text-accent-dark">Rp {p.effective_price_idr.toLocaleString("id-ID")}</span>
                            </span>
                          ) : (
                            <span className="font-bold text-ink">Rp {p.price_idr.toLocaleString("id-ID")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-ink">{p.sold_count.toLocaleString("id-ID")}</td>
                        <td className="px-4 py-3 align-top">
                          <Toggle
                            checked={p.is_active}
                            onChange={() => handleToggleActive(p)}
                            disabled={!p.has_file && !p.is_active}
                            label={`Aktifkan ${p.name}`}
                          />
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => setManageProductId(p.id)}
                            className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary"
                          >
                            Kelola
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : products.length > 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted">
                Tidak ada produk yang cocok dengan &quot;{query}&quot;.
              </p>
            ) : (
              <EmptyState className="mt-4" text='Belum ada produk -- klik "Tambah Produk" di atas untuk membuat yang pertama.' />
            )}
          </div>
        )}
      </div>

      <LivePreviewPanel page={page} links={links} products={products} />

      {manageProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={closeManageModal}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-hero"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-heading text-sm font-bold text-ink">Kelola: {manageProduct.name}</h2>
              <button
                type="button"
                onClick={closeManageModal}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary-subtle"
                aria-label="Tutup"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={coverBusyId === manageProduct.id}
                onClick={() => coverInputRefs.current[manageProduct.id]?.click()}
                title={manageProduct.cover_image_url ? "Ganti sampul" : "Tambah sampul"}
                className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-primary-subtle disabled:opacity-60"
              >
                {manageProduct.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={manageProduct.cover_image_url} alt={manageProduct.name} className="h-full w-full object-cover" />
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
                  coverInputRefs.current[manageProduct.id] = el;
                }}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadCover(manageProduct, file);
                  e.target.value = "";
                }}
              />

              <input
                ref={(el) => {
                  fileInputRefs.current[manageProduct.id] = el;
                }}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(manageProduct, file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busyId === manageProduct.id}
                onClick={() => fileInputRefs.current[manageProduct.id]?.click()}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold disabled:opacity-60 ${
                  manageProduct.has_file ? "bg-secondary-subtle text-secondary-dark" : "bg-primary-subtle text-primary"
                }`}
              >
                {manageProduct.has_file ? <IconCheck className="h-3.5 w-3.5" /> : <IconUpload className="h-3.5 w-3.5" />}
                {manageProduct.has_file ? "File terunggah" : "Unggah file"}
              </button>
              {manageProduct.has_file && (
                <button
                  type="button"
                  onClick={() => handleGetDownloadLink(manageProduct.id)}
                  title="Lihat file"
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-muted hover:bg-primary-subtle"
                >
                  <IconExternal className="h-4 w-4" />
                </button>
              )}
              {manageProduct.is_pdf && (
                <button
                  type="button"
                  onClick={() => handleToggleWatermark(manageProduct)}
                  title="Watermark otomatis (email pembeli + ID pesanan)"
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                    manageProduct.watermark_enabled ? "text-primary" : "text-muted"
                  }`}
                >
                  <IconShield className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-2.5">
              {flashSaleEditId === manageProduct.id ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                    <IconSparkle className="h-3.5 w-3.5" /> Flash Sale
                  </p>
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
                    <button type="button" onClick={() => setFlashSaleEditId(null)} className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted">
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={savingFlashSale}
                      onClick={() => handleSaveFlashSale(manageProduct)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingFlashSale ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              ) : manageProduct.is_flash_sale_active ? (
                <div className="flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-accent-dark">
                    Flash sale sampai {manageProduct.flash_sale_ends_at && new Date(manageProduct.flash_sale_ends_at).toLocaleString("id-ID")}
                  </span>
                  <button type="button" onClick={() => handleClearFlashSale(manageProduct)} className="text-[11px] font-bold text-red-600 hover:underline">
                    Batalkan
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openFlashSaleForm(manageProduct)}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] font-semibold text-muted hover:border-primary hover:text-primary"
                >
                  <IconSparkle className="h-3.5 w-3.5" /> Jadwalkan Flash Sale
                </button>
              )}

              {pwywEditId === manageProduct.id ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                    <IconWallet className="h-3.5 w-3.5" /> Bayar Seikhlasnya
                  </p>
                  <input
                    type="number"
                    placeholder="Harga minimum (Rp)"
                    value={pwywMinPrice}
                    onChange={(e) => setPwywMinPrice(e.target.value)}
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setPwywEditId(null)} className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted">
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={savingPwyw}
                      onClick={() => handleSavePwyw(manageProduct)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingPwyw ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              ) : manageProduct.pwyw_enabled ? (
                <div className="flex items-center justify-between rounded-lg bg-secondary-subtle px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-secondary-dark">
                    Bayar seikhlasnya aktif, min Rp{(manageProduct.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")}
                  </span>
                  <button type="button" onClick={() => handleClearPwyw(manageProduct)} className="text-[11px] font-bold text-red-600 hover:underline">
                    Batalkan
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openPwywForm(manageProduct)}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] font-semibold text-muted hover:border-primary hover:text-primary"
                >
                  <IconWallet className="h-3.5 w-3.5" /> Aktifkan Bayar Seikhlasnya
                </button>
              )}

              {activeCollaborators.length > 0 &&
                (splitsEditId === manageProduct.id ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                    <p className="text-[11px] text-muted">
                      Bagian pendapatan otomatis ke kolaborator setiap produk ini terjual (dipotong dari bagianmu).
                    </p>
                    {splitRows.map((row, i) => (
                      <div key={i} className="flex gap-1.5">
                        <select
                          value={row.user_id}
                          onChange={(e) => updateSplitRow(i, { user_id: e.target.value })}
                          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        >
                          <option value="">Pilih kolaborator</option>
                          {activeCollaborators.map((c) => (
                            <option key={c.collaborator_user_id} value={c.collaborator_user_id}>
                              {c.email}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          placeholder="%"
                          value={row.percent || ""}
                          onChange={(e) => updateSplitRow(i, { percent: Number(e.target.value) })}
                          className="w-16 rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setSplitRows((prev) => prev.filter((_, idx) => idx !== i))}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-50"
                        >
                          <IconTrash className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSplitRows((prev) => [...prev, { user_id: "", percent: 0 }])}
                      className="self-start text-[11px] font-semibold text-primary hover:underline"
                    >
                      + Tambah kolaborator
                    </button>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setSplitsEditId(null)} className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted">
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={savingSplits}
                        onClick={() => handleSaveSplits(manageProduct)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingSplits ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </div>
                ) : manageProduct.collaborator_splits.length > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-primary-subtle px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-primary">
                      {manageProduct.collaborator_splits.length} kolaborator berbagi{" "}
                      {manageProduct.collaborator_splits.reduce((sum, s) => sum + s.percent, 0)}% pendapatan
                    </span>
                    <button type="button" onClick={() => openSplitsForm(manageProduct)} className="text-[11px] font-bold text-primary hover:underline">
                      Ubah
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSplitsForm(manageProduct)}
                    className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] font-semibold text-muted hover:border-primary hover:text-primary"
                  >
                    <IconUsers className="h-3.5 w-3.5" /> Atur Split Kolaborator
                  </button>
                ))}
            </div>

            <button
              type="button"
              onClick={() => handleDelete(manageProduct)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <IconTrash className="h-3.5 w-3.5" />
              Hapus Produk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
