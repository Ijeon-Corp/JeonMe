"use client";

import PageSkeleton from "@/components/Skeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnalyticsSummary,
  ApiError,
  CollaboratorSplit,
  DashboardCollaborator,
  DashboardProduct,
  ExtraPageDetail,
  LinkItem,
  MyPage,
  PageStickerData,
  RecentOrder,
  createExtraPage,
  createProduct,
  deleteProduct,
  getAnalyticsSummary,
  getExtraPage,
  getMyPage,
  getProductDownloadURL,
  getSettingsProfile,
  listCollaborators,
  listExtraPageLinks,
  listMyExtraPages,
  listProducts,
  listRecentOrders,
  updateExtraPageStickers,
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
import DeliveryMethodPanel from "@/components/DeliveryMethodPanel";
import ReviewsPanel from "@/components/ReviewsPanel";
import ListingPanel from "@/components/ListingPanel";
import StorageFilesPanel from "@/components/StorageFilesPanel";
import WebhookEventsPanel from "@/components/WebhookEventsPanel";
import ShopSettingsPanel from "@/components/ShopSettingsPanel";
import TransactionPanel from "@/components/TransactionPanel";
import ProdukPageEditor, { DesignSection } from "@/components/ProdukPageEditor";
import { confirmDelete } from "@/lib/confirm";
import { SITE_URL } from "@/lib/site";

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
// renderCoverPicker -- gambar sampul WAJIB (permintaan langsung pengguna,
// 19 Agustus 2026: "gambar sampul dan juga gambar product itu disamakan
// saja jadi sampul jangan dijadikan opsional") -- dipakai bersama ketiga
// form create (Digital/Payment Link/Link Eksternal) di bawah, sama seperti
// renderCategoryTabs dipakai bersama di PagePreview.tsx. `required` di
// input asli TETAP dipasang sebagai jaring pengaman native HTML5, tapi
// validasi UX utamanya lewat pengecekan `if (!coverFile)` eksplisit di
// masing-masing handler (pesan error lebih jelas & konsisten dengan
// validasi nama/harga lain di form yang sama).
function renderCoverPicker(coverFile: File | null, setCoverFile: (f: File | null) => void) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-xs font-semibold text-muted hover:border-primary hover:text-primary">
      <IconCamera className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 truncate">{coverFile ? coverFile.name : "Pilih gambar sampul (wajib)"}</span>
      <input
        type="file"
        required
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

export default function DashboardProductsPage() {
  const [tab, setTab] = useState<
    | "halaman_toko"
    | "overview"
    | "manage"
    | "reviews"
    | "listing"
    | "storage"
    | "webhook_events"
    | "shop_settings"
    | "transaction"
  >("overview");

  const [page, setPage] = useState<MyPage | null>(null);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewRangeDays, setOverviewRangeDays] = useState(30);

  // addMode -- Modul Toko (Fase B3): "+ Tambah Produk" sekarang membuka
  // panel pilihan "Add Items" ala referensi (Digital Product vs Payment
  // Link vs Link Eksternal) alih-alih langsung membuka satu form.
  const [addMode, setAddMode] = useState<"closed" | "choose" | "digital" | "payment_link" | "external_link">("closed");
  const [name, setName] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [category, setCategory] = useState("");
  // coverFile -- permintaan langsung pengguna, 19 Agustus 2026: "gambar
  // sampul... jangan dijadikan opsional". Dipakai BERSAMA ketiga form
  // (Digital/Payment Link/Link Eksternal) di bawah, sama seperti name/
  // priceIDR/category -- backend menolak aktivasi produk apa pun tanpa
  // cover_image_url (lihat gerbang di product.go Update), jadi wajib
  // dikumpulkan di sini SEBELUM create, bukan sesudahnya lewat panel
  // Kelola seperti sebelumnya (yang bikin produk baru "menghilang" dari
  // Toko tanpa penjelasan jelas kenapa).
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [itemsPage, setItemsPage] = useState(1);

  // Payment Link (Fase D) -- field TAMBAHAN, terpisah dari form Digital
  // Product di atas (name/priceIDR/category dipakai bersama).
  const [successMessage, setSuccessMessage] = useState("");
  const [paymentLimitCount, setPaymentLimitCount] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");

  // Link Eksternal (migrasi 000068) -- permintaan langsung pengguna, 17
  // Agustus 2026: "saya mau untuk produk bisa untuk affiliate juga ke
  // shopee dll". Field TAMBAHAN, terpisah dari form Digital Product/
  // Payment Link di atas (name/priceIDR/category dipakai bersama).
  const [externalUrl, setExternalUrl] = useState("");
  // externalUrlEditId/externalUrlDraft -- edit tautan produk external_link
  // yang SUDAH ada dari modal Kelola (pola sama seperti categoryEditId di
  // bawah), karena ProductKind sendiri immutable tapi ExternalURL-nya
  // tetap boleh diubah lewat Update (lihat catatan di product.go).
  const [externalUrlEditId, setExternalUrlEditId] = useState<string | null>(null);
  const [externalUrlDraft, setExternalUrlDraft] = useState("");
  const [savingExternalUrl, setSavingExternalUrl] = useState(false);

  // categoryEditId -- Modul Toko (Fase B1): edit kategori dari modal Kelola.
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

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
    Promise.all([getMyPage(), listProducts(), listCollaborators()])
      .then(([p, prod, collabs]) => {
        setPage(p);
        setProducts(prod);
        setActiveCollaborators(collabs.filter((c) => c.status === "active" && c.collaborator_user_id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat produk."))
      .finally(() => setLoading(false));
  }, []);

  // ---------- Modul Halaman Toko: data Toko (BUKAN Bio) untuk pratinjau
  // yang dipakai di SEMUA tab menu Produk (bukan cuma tab "Halaman Toko"),
  // dan untuk ProdukPageEditor sendiri -- diangkat ke sini (bukan lagi
  // diambil sendiri-sendiri oleh ProdukPageEditor) supaya SATU sumber data
  // dipakai bersama, tidak ada pratinjau Bio yang salah konteks atau
  // pratinjau dobel. Lihat catatan lengkap di ProdukPageEditor.tsx.
  const [tokoUsername, setTokoUsername] = useState("");
  const [tokoPage, setTokoPage] = useState<ExtraPageDetail | null>(null);
  const [tokoLinks, setTokoLinks] = useState<LinkItem[]>([]);
  const [tokoLoading, setTokoLoading] = useState(true);
  const [tokoError, setTokoError] = useState<string | null>(null);
  const [tokoCreating, setTokoCreating] = useState(false);
  // tokoSection -- tab desain internal ProdukPageEditor (Blok/Tema/Header/
  // Tombol/Font/Stiker), diangkat ke sini (permintaan langsung pengguna:
  // "langsung edit di bagian pratinjau nya") supaya <LivePreviewPanel> di
  // bawah tahu kapan harus menyalakan editableStickers (tab Stiker aktif).
  const [tokoSection, setTokoSection] = useState<DesignSection>("blok");

  // loadTokoData -- murni ambil & kembalikan data, TANPA setState di
  // dalamnya (aturan lint react-hooks/set-state-in-effect, lihat catatan
  // yang sama di commit sebelumnya).
  async function loadTokoData() {
    const profile = await getSettingsProfile();
    const pages = await listMyExtraPages();
    const canonical = pages.find((p) => p.page_type === "produk" && p.slug === profile.username);
    if (!canonical) {
      return { username: profile.username, page: null as ExtraPageDetail | null, links: [] as LinkItem[] };
    }
    const [detail, pageLinks] = await Promise.all([getExtraPage(canonical.id), listExtraPageLinks(canonical.id)]);
    return { username: profile.username, page: detail, links: pageLinks };
  }

  const applyTokoResult = useCallback((result: Awaited<ReturnType<typeof loadTokoData>>) => {
    setTokoUsername(result.username);
    setTokoPage(result.page);
    setTokoLinks(result.links);
  }, []);

  useEffect(() => {
    loadTokoData()
      .then(applyTokoResult)
      .catch((err) => setTokoError(err instanceof ApiError ? err.message : "Gagal memuat Halaman Toko."))
      .finally(() => setTokoLoading(false));
  }, [applyTokoResult]);

  async function handleCreateTokoNow() {
    setTokoError(null);
    setTokoCreating(true);
    try {
      await createExtraPage({ name: `Toko ${tokoUsername}`, slug: tokoUsername, page_type: "produk" });
      applyTokoResult(await loadTokoData());
    } catch (err) {
      setTokoError(err instanceof ApiError ? err.message : "Gagal membuat Halaman Toko.");
    } finally {
      setTokoCreating(false);
    }
  }

  async function handleTokoStickersChange(stickers: PageStickerData[]) {
    if (!tokoPage) return;
    const previous = tokoPage;
    setTokoPage({ ...tokoPage, stickers });
    try {
      await updateExtraPageStickers(tokoPage.id, stickers);
    } catch (err) {
      setTokoPage(previous);
      setTokoError(err instanceof ApiError ? err.message : "Gagal menyimpan stiker.");
    }
  }

  // tokoPreviewData -- bentuk MyPage supaya bisa dipakai LivePreviewPanel
  // yang sama dengan halaman utama (lihat catatan sama di ProdukPageEditor
  // sebelum diangkat ke sini). "verification" murni kosmetik pratinjau,
  // BUKAN status sungguhan -- halaman publik asli tetap benar (dihitung
  // account-wide di finishPublicPageResponse, page.go).
  const tokoPreviewPage: MyPage | null = tokoPage
    ? {
        ...tokoPage,
        username: tokoUsername,
        verification: { email_verified: false, profile_complete: false, has_paid_order: false, is_verified: false },
      }
    : null;

  useEffect(() => {
    Promise.all([getAnalyticsSummary({ range_days: overviewRangeDays }), listRecentOrders()])
      .then(([s, orders]) => {
        setSummary(s);
        setRecentOrders(orders);
      })
      .catch((err) => setOverviewError(err instanceof ApiError ? err.message : "Gagal memuat ringkasan toko."));
  }, [overviewRangeDays]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama produk wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (!coverFile) {
      setError("Gambar sampul wajib diunggah.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const { id } = await createProduct({ name, price_idr: price, category: category.trim() || undefined });
      // Sampul WAJIB (permintaan langsung pengguna, 19 Agustus 2026) --
      // diunggah LANGSUNG setelah produk dibuat, bukan lagi langkah
      // opsional terpisah lewat panel Kelola. Produk digital MASIH perlu
      // unggah File Produk & aktivasi manual terpisah seperti sebelumnya
      // (tidak berubah) -- sampul cuma satu syarat TAMBAHAN, bukan
      // pengganti file.
      await uploadProductCover(id, coverFile);
      setProducts(await listProducts());
      setName("");
      setPriceIDR("");
      setCategory("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat produk.");
    } finally {
      setCreating(false);
    }
  }

  // handleCreatePaymentLink -- Modul Toko (Fase D). link_expires_at dikirim
  // sebagai ISO (RFC3339) dari <input type="datetime-local">, yang TIDAK
  // menyertakan zona waktu -- new Date(...).toISOString() mengasumsikan
  // waktu lokal browser, konsisten dengan cara flash sale/event date
  // dikirim di tempat lain pada file ini.
  async function handleCreatePaymentLink(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (!coverFile) {
      setError("Gambar sampul wajib diunggah.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const { id } = await createProduct({
        name,
        price_idr: price,
        category: category.trim() || undefined,
        product_kind: "payment_link",
        success_message: successMessage.trim() || undefined,
        payment_limit_count: paymentLimitCount ? Number(paymentLimitCount) : undefined,
        link_expires_at: linkExpiresAt ? new Date(linkExpiresAt).toISOString() : undefined,
      });
      // Sampul WAJIB (permintaan langsung pengguna, 19 Agustus 2026) --
      // Payment Link TIDAK LAGI aktif otomatis begitu dibuat (lihat
      // product.go Create), jadi aktivasi eksplisit di sini SETELAH
      // sampul terunggah supaya UX "langsung jadi" yang sudah ada
      // sebelumnya tetap terasa sama dari sisi kreator.
      await uploadProductCover(id, coverFile);
      await updateProduct(id, { is_active: true });
      setProducts(await listProducts());
      setName("");
      setPriceIDR("");
      setCategory("");
      setSuccessMessage("");
      setPaymentLimitCount("");
      setLinkExpiresAt("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat payment link.");
    } finally {
      setCreating(false);
    }
  }

  // handleCreateExternalLink -- Modul Toko (migrasi 000068, permintaan
  // langsung pengguna: "saya mau untuk produk bisa untuk affiliate juga
  // ke shopee dll"). Diaktifkan otomatis setelah sampul terunggah (lihat
  // catatan lengkap di handleCreatePaymentLink -- gerbang sampul wajib
  // sejak 19 Agustus 2026 membuat produk ini TIDAK LAGI aktif otomatis
  // langsung dari Create seperti sebelumnya).
  async function handleCreateExternalLink(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (!externalUrl.trim()) {
      setError("Tautan produk (mis. link Shopee/Tokopedia) wajib diisi.");
      return;
    }
    if (!coverFile) {
      setError("Gambar sampul wajib diunggah.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const { id } = await createProduct({
        name,
        price_idr: price,
        category: category.trim() || undefined,
        product_kind: "external_link",
        external_url: externalUrl.trim(),
      });
      await uploadProductCover(id, coverFile);
      await updateProduct(id, { is_active: true });
      setProducts(await listProducts());
      setName("");
      setPriceIDR("");
      setCategory("");
      setExternalUrl("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat produk link eksternal.");
    } finally {
      setCreating(false);
    }
  }

  // handleSaveExternalUrl -- ubah tautan produk external_link yang SUDAH
  // ada (lewat modal Kelola) -- lihat catatan di externalUrlEditId.
  async function handleSaveExternalUrl(product: DashboardProduct) {
    if (!externalUrlDraft.trim()) {
      setError("Tautan produk tidak boleh kosong.");
      return;
    }
    setError(null);
    setSavingExternalUrl(true);
    try {
      await updateProduct(product.id, { external_url: externalUrlDraft.trim() });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, external_url: externalUrlDraft.trim() } : p)));
      setExternalUrlEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan tautan.");
    } finally {
      setSavingExternalUrl(false);
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
    setCategoryEditId(null);
  }

  function openCategoryForm(p: DashboardProduct) {
    setCategoryEditId(p.id);
    setCategoryDraft(p.category);
  }

  async function handleSaveCategory(p: DashboardProduct) {
    setError(null);
    setSavingCategory(true);
    try {
      await updateProduct(p.id, { category: categoryDraft.trim() });
      setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, category: categoryDraft.trim() } : x)));
      setCategoryEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan kategori.");
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDelete(product: DashboardProduct) {
    if (!(await confirmDelete(`Hapus produk "${product.name}"? Aksi ini tidak bisa dibatalkan.`))) return;
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

  if (loading) return <PageSkeleton />;

  // categories -- Modul Toko (Fase B1): daftar kategori UNIK dari produk
  // yang sudah ada, bukan taksonomi tetap -- filter dropdown ini otomatis
  // mengikuti apa pun yang kreator isi sendiri.
  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.trim().toLowerCase()) && (categoryFilter === "" || p.category === categoryFilter)
  );
  const manageProduct = products.find((p) => p.id === manageProductId) ?? null;

  // Pagination (Fase B2) -- client-side, cukup untuk skala jumlah produk
  // per kreator saat ini (tidak perlu server-side pagination).
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(itemsPage, totalPages);
  const pagedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    // "max-w-3xl" (kolom konten) & "mx-auto max-w-6xl" (grid) DIHAPUS --
    // lihat catatan lengkap di DesignPageShell.tsx/dashboard/links/page.tsx.
    //
    // Bug ditemukan (8 Agustus 2026, audit responsif): kolom konten grid
    // ini TIDAK PERNAH diberi min-w-0 -- grid item defaultnya min-width:auto
    // (sama seperti flex item, lihat akar masalah yang sama persis di
    // dashboard/layout.tsx, commit 08c1b78), jadi bisa memaksa SELURUH
    // halaman melebar horizontal kalau ada konten di kolom kiri yang lebar
    // alaminya melebihi ruang tersedia (baru benar-benar ketahuan lewat tab
    // "Halaman Toko" yang kontennya lebih padat). Semua tab SEKARANG
    // menampilkan pratinjau Toko yang SAMA (bukan pratinjau Bio) --
    // permintaan langsung pengguna: menu Produk konsisten menunjukkan Toko,
    // bukan campur-campur Bio/Toko/tidak ada tergantung tab.
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div className="min-w-0">
        {/* Bug ditemukan (5 Agustus 2026, audit responsif): 8 tab tanpa
            wrapper scroll memaksa SELURUH halaman melebar horizontal di
            layar sempit (bukan cuma baris tab ini yang terpotong). overflow-
            x-auto membuat scroll-nya lokal ke baris tab saja, flex-shrink-0
            + whitespace-nowrap di tiap tombol mencegah teksnya sendiri
            terpotong/melipat sebelum scroll sempat aktif. */}
        <div className="flex gap-2 overflow-x-auto border-b border-border [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setTab("halaman_toko")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "halaman_toko" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Halaman Toko
          </button>
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "overview" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("manage")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "manage" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Manage Items
          </button>
          <button
            type="button"
            onClick={() => setTab("reviews")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "reviews" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Reviews
          </button>
          <button
            type="button"
            onClick={() => setTab("listing")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "listing" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Listing
          </button>
          <button
            type="button"
            onClick={() => setTab("storage")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "storage" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Storage & Files
          </button>
          <button
            type="button"
            onClick={() => setTab("webhook_events")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "webhook_events" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Webhook Events
          </button>
          <button
            type="button"
            onClick={() => setTab("shop_settings")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "shop_settings" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Shop Settings
          </button>
          <button
            type="button"
            onClick={() => setTab("transaction")}
            className={`flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              tab === "transaction" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Transaction
          </button>
        </div>

        {tab === "halaman_toko" ? (
          <div className="mt-4">
            <ProdukPageEditor
              loading={tokoLoading}
              username={tokoUsername}
              page={tokoPage}
              setPage={setTokoPage}
              links={tokoLinks}
              setLinks={setTokoLinks}
              error={tokoError}
              setError={setTokoError}
              creating={tokoCreating}
              onCreateNow={handleCreateTokoNow}
              onStickersChange={handleTokoStickersChange}
              section={tokoSection}
              setSection={setTokoSection}
            />
          </div>
        ) : tab === "reviews" ? (
          <ReviewsPanel />
        ) : tab === "listing" ? (
          <ListingPanel products={products} setProducts={setProducts} onError={(message) => setError(message)} />
        ) : tab === "storage" ? (
          <StorageFilesPanel />
        ) : tab === "webhook_events" ? (
          <WebhookEventsPanel />
        ) : tab === "shop_settings" ? (
          <ShopSettingsPanel />
        ) : tab === "transaction" ? (
          <TransactionPanel />
        ) : tab === "overview" ? (
          <div className="mt-4">
            {/* Identitas Toko -- permintaan referensi gambar: nama & tautan
                halaman publik selalu terlihat di atas Overview, bukan cuma
                di panel pratinjau kanan. */}
            {page && (
              <div className="glass mb-4 flex items-center gap-3 rounded-3xl p-4 shadow-card">
                {page.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.avatar_url} alt={page.username} className="h-11 w-11 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-sm font-bold text-primary">
                    {page.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{page.display_name || `@${page.username}`}</p>
                  <a
                    href={`${SITE_URL}/${page.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs text-primary hover:underline"
                  >
                    jeon.id/{page.username}
                  </a>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setOverviewRangeDays(d)}
                  className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    overviewRangeDays === d
                      ? "border-primary bg-primary-subtle text-primary"
                      : "border-border text-muted hover:border-primary/50"
                  }`}
                >
                  {d} hari
                </button>
              ))}
            </div>

            {overviewError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{overviewError}</p>}
            <div className="mt-3">
              {summary ? <ShopOverviewPanel summary={summary} recentOrders={recentOrders} /> : <PageSkeleton />}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-muted">
              Unggah file (pdf/zip/epub/mp4/mp3/mov/gambar, maks 100MB) sebelum mengaktifkan produk. Tambahkan sampul
              (jpg/png/webp, maks 5MB) supaya tampil menarik di halaman publik.
            </p>

            {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                <div className="relative flex-1 sm:max-w-xs">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setItemsPage(1);
                    }}
                    placeholder="Cari produk..."
                    className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-xs focus:border-primary focus:outline-none"
                  />
                </div>
                {categories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setItemsPage(1);
                    }}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="">Semua Kategori</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {addMode === "closed" && (
                <button
                  type="button"
                  onClick={() => setAddMode("choose")}
                  className="btn-primary flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Tambah Produk
                </button>
              )}
            </div>

            {/* Modul Toko (Fase B3): panel "Add Items" ala referensi -- pilih
                jenis item dulu sebelum masuk ke form spesifiknya. */}
            {addMode === "choose" && (
              <div className="glass mt-3 grid grid-cols-1 gap-2.5 rounded-3xl p-4 shadow-card sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setAddMode("digital")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-border p-3.5 text-left hover:border-primary"
                >
                  <IconUpload className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-ink">Digital Product</span>
                  <span className="text-[11px] text-muted">Jual produk digital seperti file, e-book, software, template.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("payment_link")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-border p-3.5 text-left hover:border-primary"
                >
                  <IconWallet className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-ink">Payment Link</span>
                  <span className="text-[11px] text-muted">Terima pembayaran untuk jasa, donasi, atau tujuan khusus lain.</span>
                </button>
                {/* Link Eksternal -- permintaan langsung pengguna, 17
                    Agustus 2026: "saya mau untuk produk bisa untuk
                    affiliate juga ke shopee dll". Beda dari fitur Afiliasi
                    (menu Audiens & Pemasaran, referral Jeonme-internal) --
                    ini murni tombol Beli yang membuka tautan marketplace
                    lain (boleh link affiliate milik kreator sendiri). */}
                <button
                  type="button"
                  onClick={() => setAddMode("external_link")}
                  className="flex flex-col items-start gap-1 rounded-xl border border-border p-3.5 text-left hover:border-primary"
                >
                  <IconExternal className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-ink">Link Eksternal</span>
                  <span className="text-[11px] text-muted">Tombol Beli membuka listing di Shopee/Tokopedia/toko lain (boleh link affiliate).</span>
                </button>
              </div>
            )}

            {addMode === "digital" && (
              <form onSubmit={handleCreate} className="glass mt-3 flex flex-col gap-2 rounded-3xl p-4 shadow-card">
                <div className="flex flex-col gap-2 sm:flex-row">
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
                  <input
                    type="text"
                    placeholder="Kategori (opsional)"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {renderCoverPicker(coverFile, setCoverFile)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? "Membuat..." : "Buat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode("closed");
                      setName("");
                      setPriceIDR("");
                      setCategory("");
                      setCoverFile(null);
                    }}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted hover:border-ink/30"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {addMode === "payment_link" && (
              <form onSubmit={handleCreatePaymentLink} className="glass mt-3 flex flex-col gap-2 rounded-3xl p-4 shadow-card">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="Judul (mis. Konsultasi 1 Jam)"
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
                </div>
                <textarea
                  placeholder="Pesan sukses untuk pembeli (opsional) -- ditampilkan setelah pembayaran berhasil"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="number"
                    min={1}
                    placeholder="Batas jumlah pembayaran (opsional)"
                    value={paymentLimitCount}
                    onChange={(e) => setPaymentLimitCount(e.target.value)}
                    className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    type="datetime-local"
                    value={linkExpiresAt}
                    onChange={(e) => setLinkExpiresAt(e.target.value)}
                    title="Kedaluwarsa link (opsional)"
                    className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                {renderCoverPicker(coverFile, setCoverFile)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? "Membuat..." : "Buat Payment Link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode("closed");
                      setName("");
                      setPriceIDR("");
                      setSuccessMessage("");
                      setPaymentLimitCount("");
                      setLinkExpiresAt("");
                      setCoverFile(null);
                    }}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted hover:border-ink/30"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {addMode === "external_link" && (
              <form onSubmit={handleCreateExternalLink} className="glass mt-3 flex flex-col gap-2 rounded-3xl p-4 shadow-card">
                <div className="flex flex-col gap-2 sm:flex-row">
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
                </div>
                <input
                  type="url"
                  required
                  placeholder="Tautan produk (mis. https://shopee.co.id/... atau link affiliate kamu)"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="text"
                  placeholder="Kategori (opsional)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {renderCoverPicker(coverFile, setCoverFile)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? "Membuat..." : "Buat Produk"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode("closed");
                      setName("");
                      setPriceIDR("");
                      setCategory("");
                      setExternalUrl("");
                      setCoverFile(null);
                    }}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted hover:border-ink/30"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            {filteredProducts.length > 0 ? (
              <div className="glass mt-4 overflow-x-auto rounded-3xl shadow-card">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Harga</th>
                      <th className="px-4 py-3">Terjual</th>
                      {/* Diklik -- permintaan langsung pengguna, 13 Agustus
                          2026: "di link bio dan juga product tambahkan
                          dibagian bawah statistik berapa kali jumlah klik
                          per bloknya" -- jumlah klik NYATA dari
                          analytics_events (event_type="product_click"),
                          kolom baru di sebelah "Terjual", pola sama persis
                          (dihitung backend, bukan angka rekaan). */}
                      <th className="px-4 py-3">Diklik</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map((p) => (
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
                                {p.product_kind === "payment_link" && (
                                  <span className="rounded-full bg-primary-subtle px-1.5 py-0.5 text-[9px] font-bold text-primary">Payment Link</span>
                                )}
                                {p.product_kind === "external_link" && (
                                  // Diklik langsung ke tautan afiliasinya --
                                  // permintaan langsung pengguna, 19 Agustus
                                  // 2026: "Manage items tipe external link
                                  // harusnya bisa di klik menuju product
                                  // affiliate nya". stopPropagation TIDAK
                                  // perlu di sini (baris tabel ini sendiri
                                  // tidak punya onClick, cuma tombol "Kelola"
                                  // terpisah di ujung kanan yang membuka
                                  // panel), jadi aman tanpa itu.
                                  <a
                                    href={p.external_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-0.5 rounded-full bg-primary-subtle px-1.5 py-0.5 text-[9px] font-bold text-primary hover:underline"
                                  >
                                    Link Eksternal <IconExternal className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                {p.category && (
                                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-muted">{p.category}</span>
                                )}
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
                        <td className="px-4 py-3 align-top text-muted">{p.click_count.toLocaleString("id-ID")}</td>
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
                Tidak ada produk yang cocok dengan pencarian/filter ini.
              </p>
            ) : (
              <EmptyState className="mt-4" text='Belum ada produk -- klik "Tambah Produk" di atas untuk membuat yang pertama.' />
            )}

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setItemsPage(n)}
                    className={`h-8 w-8 rounded-lg text-xs font-semibold ${
                      n === currentPage ? "bg-primary text-white" : "text-ink hover:bg-primary-subtle"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setItemsPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <LivePreviewPanel
        page={tokoPreviewPage}
        links={tokoLinks}
        products={products}
        pageType="produk"
        pageSlug={tokoPage?.slug}
        openUrl={tokoPage ? `${SITE_URL}/p/${tokoPage.slug}` : undefined}
        editableStickers={tab === "halaman_toko" && tokoSection === "stiker"}
        onStickersChange={handleTokoStickersChange}
      />

      {manageProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
          onClick={closeManageModal}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-hero"
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

            {categoryEditId === manageProduct.id ? (
              <div className="mt-2 flex gap-1.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Kategori"
                  value={categoryDraft}
                  onChange={(e) => setCategoryDraft(e.target.value)}
                  className="flex-1 rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                />
                <button type="button" onClick={() => setCategoryEditId(null)} className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted">
                  Batal
                </button>
                <button
                  type="button"
                  disabled={savingCategory}
                  onClick={() => handleSaveCategory(manageProduct)}
                  className="btn-primary rounded-md px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                >
                  {savingCategory ? "..." : "Simpan"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => openCategoryForm(manageProduct)} className="mt-2 text-[11px] font-semibold text-primary hover:underline">
                {manageProduct.category ? `Kategori: ${manageProduct.category}` : "+ Atur kategori"}
              </button>
            )}

            {/* Permintaan langsung pengguna, 14 Agustus 2026: "saat kelola
                produk ada 2 yang perlu diunggah yaitu icon dan produk nya,
                sebagai user saya bingung dengan ui dan ux nya" -- akar
                masalahnya BUKAN bug (toggle Aktifkan memang bekerja benar),
                tapi tombol sampul sebelumnya cuma ikon kamera kecil TANPA
                label teks sama sekali, duduk bersebelahan dengan tombol
                "Unggah file" yang justru WAJIB utk mengaktifkan produk --
                gampang tertukar. Sekarang keduanya diberi label & keterangan
                wajib/opsional yang eksplisit, langsung di dalam modal ini
                (bukan cuma di atas tabel, yang sudah tidak terlihat lagi
                begitu modal Kelola terbuka).
                Diperbarui 19 Agustus 2026 (permintaan langsung pengguna:
                "sampul jangan dijadikan opsional"): Sampul SEKARANG JUGA
                wajib untuk semua jenis produk (termasuk Payment Link/Link
                Eksternal yang tidak punya File Produk sama sekali) --
                gerbang aktivasi backend (product.go) menolak keduanya kalau
                salah satu kosong. */}
            <p className="mt-4 text-[11px] leading-relaxed text-muted">
              <strong className="text-ink">File Produk</strong> (pdf/zip/epub/mp4/mp3/mov/gambar) wajib diunggah
              supaya bisa diaktifkan -- ini yang akan diterima pembeli (kecuali Payment Link/Link Eksternal, tidak
              butuh file). <strong className="text-ink">Sampul</strong> WAJIB untuk semua jenis produk -- gambar
              yang tampil di kartu produk halaman publik.
            </p>
            <div className="mt-2.5 flex items-end gap-3">
              <div className="flex flex-shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  disabled={coverBusyId === manageProduct.id}
                  onClick={() => coverInputRefs.current[manageProduct.id]?.click()}
                  title={manageProduct.cover_image_url ? "Ganti sampul" : "Tambah sampul"}
                  className="relative h-14 w-14 overflow-hidden rounded-xl bg-primary-subtle disabled:opacity-60"
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
                <span className="text-[10px] font-semibold text-muted">Sampul (wajib)</span>
              </div>
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

              {manageProduct.product_kind !== "payment_link" && manageProduct.product_kind !== "external_link" && (
                <>
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
                    {manageProduct.has_file ? "File Produk terunggah" : "Unggah File Produk (wajib)"}
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
                </>
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

            {/* Tautan produk -- Modul Toko (migrasi 000068): satu-satunya
                field khusus external_link yang bisa diubah setelah dibuat
                (ProductKind sendiri immutable, lihat catatan di product.go). */}
            {manageProduct.product_kind === "external_link" && (
              <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
                  <IconExternal className="h-3.5 w-3.5" /> Tautan Produk
                </p>
                {externalUrlEditId === manageProduct.id ? (
                  <>
                    <input
                      type="url"
                      autoFocus
                      value={externalUrlDraft}
                      onChange={(e) => setExternalUrlDraft(e.target.value)}
                      className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={savingExternalUrl}
                        onClick={() => handleSaveExternalUrl(manageProduct)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingExternalUrl ? "Menyimpan..." : "Simpan"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExternalUrlEditId(null)}
                        className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted hover:border-ink/30"
                      >
                        Batal
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[11px] text-ink">{manageProduct.external_url}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setExternalUrlEditId(manageProduct.id);
                        setExternalUrlDraft(manageProduct.external_url);
                      }}
                      className="flex-shrink-0 text-[11px] font-bold text-primary hover:underline"
                    >
                      Ubah
                    </button>
                  </div>
                )}
              </div>
            )}

            {manageProduct.product_kind !== "payment_link" && manageProduct.product_kind !== "external_link" && (
              <DeliveryMethodPanel
                key={manageProduct.id}
                product={manageProduct}
                onUpdated={(patch) => setProducts((prev) => prev.map((p) => (p.id === manageProduct.id ? { ...p, ...patch } : p)))}
                onError={(message) => setError(message)}
              />
            )}

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
