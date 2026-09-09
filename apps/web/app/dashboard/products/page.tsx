"use client";

import PageSkeleton from "@/components/Skeleton";
import { ChartSkeleton, KpiSkeleton } from "@/components/dashboard/feedback/Skeletons";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  AnalyticsSummary,
  ApiError,
  CollaboratorSplit,
  DashboardCollaborator,
  DashboardProduct,
  ExtraPage,
  ExtraPageDetail,
  LinkItem,
  MyPage,
  PageStickerData,
  RecentOrder,
  createExtraPage,
  createProduct,
  deleteExtraPage,
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
  updateExtraPage,
  updateExtraPageStickers,
  updateProduct,
  uploadProductCover,
  uploadProductFile,
} from "@/lib/api-client";
import {
  IconBox,
  IconCamera,
  IconChevronRight,
  IconExternal,
  IconPlus,
  IconSearch,
  IconSparkle,
  IconTrash,
  IconUpload,
  IconWallet,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import type { DesignSection } from "@/components/ProdukPageEditor";
import { confirmDelete } from "@/lib/confirm";
import { SITE_URL } from "@/lib/site";
import { slugifyTitle } from "@/lib/slug";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// Panel tab Toko (Overview/Reviews/Listing/Storage/Webhook/Settings/Transaction)
// dan editor Toko dimuat lewat next/dynamic -- hanya 1 dari 8 yang pernah
// tampil sekaligus (digerbang state `tab`), jadi men-static-import semuanya
// membengkakkan bundle JS awal halaman ini secara sia-sia. Halaman ini salah
// satu yang terberat di dashboard (bareng links/page.tsx) dan diduga jadi
// penyebab race hidrasi <Link> vs klik pengguna yang bikin sidebar kadang
// terlihat "refresh"/collapse balik (dilaporkan pengguna 27 Agt 2026) --
// mengecilkan bundle awal mengurangi jendela race itu, sama seperti kenapa
// halaman ringan (business-card/balance) tidak pernah kena masalah ini.
const ShopOverviewPanel = dynamic(() => import("@/components/ShopOverviewPanel"));
const ReviewsPanel = dynamic(() => import("@/components/ReviewsPanel"));
const ListingPanel = dynamic(() => import("@/components/ListingPanel"));
const StorageFilesPanel = dynamic(() => import("@/components/StorageFilesPanel"));
const WebhookEventsPanel = dynamic(() => import("@/components/WebhookEventsPanel"));
const ShopSettingsPanel = dynamic(() => import("@/components/ShopSettingsPanel"));
const TransactionPanel = dynamic(() => import("@/components/TransactionPanel"));
const ProdukPageEditor = dynamic(() => import("@/components/ProdukPageEditor"));
const ManageProductModal = dynamic(() => import("@/components/ManageProductModal"));

// Modul Toko (permintaan langsung pengguna: "ikuti seluruh alur yang ada di
// gambar ini" -- referensi dashboard toko Overview + Manage Items. Prioritas
// dipilih lewat AskUserQuestion: "Overview + Manage Items dulu", dan format
// tabel (bukan format baris ringkas lama) juga dipilih eksplisit lewat
// AskUserQuestion kedua). Reviews/Listing/Voucher/Storage & Files/Webhook
// Events/Shop Settings dari gambar SENGAJA belum dikerjakan -- di luar
// prioritas yang dipilih.
//
// "Jenis Produk"/"Stok" dari gambar SENGAJA tidak ditiru -- List() backend
// cuma mengembalikan produk digital biasa (bundel/donasi/kelas
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
function renderCoverPicker(coverFile: File | null, setCoverFile: (f: File | null) => void, t: (key: string) => string) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-app-border px-3.5 py-2.5 text-xs font-semibold text-app-muted hover:border-jeon-purple hover:text-jeon-purple">
      <IconCamera className="h-4 w-4 flex-shrink-0" />
      <span className="min-w-0 truncate">{coverFile ? coverFile.name : t("dashboard.pages.products.coverPicker.placeholder")}</span>
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

// PREMIUM_PRODUK_PAGE_LIMIT -- SAMA PERSIS batas backend
// (premiumProdukPageLimit, page.go): 1 Toko gratis (canonical, otomatis),
// sampai 5 total (termasuk canonical) untuk Premium (multi-brand). Murni
// utk UI, backend tetap sumber kebenaran validasinya.
const PREMIUM_PRODUK_PAGE_LIMIT = 5;

// Adapter URL ?tab= (JEONID-DASHBOARD-REDESIGN-SPEC.md §5.2, Phase 2 shell):
// sidebar IA baru menautkan Ringkasan/Produk/Pesanan sebagai
// /products?tab=overview|items|transactions. Param URL <-> state tab internal
// disinkronkan dua arah; deep-link lama tanpa query tetap jatuh ke overview
// (default lama). Nama param URL = istilah spec, nama internal tetap.
type ProductsTab =
  | "halaman_toko"
  | "overview"
  | "manage"
  | "reviews"
  | "listing"
  | "storage"
  | "webhook_events"
  | "shop_settings"
  | "transaction";

const TAB_FROM_URL: Record<string, ProductsTab> = {
  overview: "overview",
  items: "manage",
  transactions: "transaction",
  store: "halaman_toko",
  reviews: "reviews",
  listing: "listing",
  storage: "storage",
  webhook: "webhook_events",
  settings: "shop_settings",
};
// Tab sekunder di balik menu "Lainnya" (SPEC §13.1) + key label i18n-nya.
const MORE_TABS: ProductsTab[] = ["reviews", "listing", "storage", "webhook_events", "shop_settings"];
const MORE_TAB_LABEL_KEY: Partial<Record<ProductsTab, string>> = {
  reviews: "reviews",
  listing: "listing",
  storage: "storage",
  webhook_events: "webhookEvents",
  shop_settings: "shopSettings",
};

const TAB_TO_URL: Record<ProductsTab, string> = {
  overview: "overview",
  manage: "items",
  transaction: "transactions",
  halaman_toko: "store",
  reviews: "reviews",
  listing: "listing",
  storage: "storage",
  webhook_events: "webhook",
  shop_settings: "settings",
};

// useSearchParams butuh Suspense boundary (dok Next use-search-params) --
// default export tinggal wrapper.
export default function DashboardProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardProductsPageInner />
    </Suspense>
  );
}

function DashboardProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();

  // urlTab DIHITUNG SEBELUM useState supaya mount langsung dengan
  // ?tab=transactions membuka tab itu (bukan default overview lalu
  // menunggu perubahan query berikutnya).
  const urlTab = TAB_FROM_URL[searchParams.get("tab") ?? "overview"] ?? "overview";
  const [tab, setTab] = useState<ProductsTab>(urlTab);

  // Tab bar dua tingkat (SPEC §13.1).
  const [moreTabsOpen, setMoreTabsOpen] = useState(false);
  const moreTabsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreTabsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (moreTabsRef.current && !moreTabsRef.current.contains(e.target as Node)) {
        setMoreTabsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreTabsOpen]);

  // Sinkron perubahan URL BERIKUTNYA -> state (klik leaf sidebar saat sudah
  // di halaman ini): pola resmi "adjust state during render" (aturan repo
  // react-hooks), bukan effect.
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  if (urlTab !== prevUrlTab) {
    setPrevUrlTab(urlTab);
    setTab(urlTab);
  }

  // Sinkron state -> URL saat klik tab internal (replace, tanpa scroll &
  // tanpa menumpuk history).
  function setTabAndUrl(next: ProductsTab) {
    setTab(next);
    router.replace(`/dashboard/products?tab=${TAB_TO_URL[next]}`, { scroll: false });
  }

  const [page, setPage] = useState<MyPage | null>(null);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  useErrorToast(overviewError);
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

  // Advance Option (permintaan langsung pengguna, 5 September 2026): Release
  // Time, Fee, notifikasi WhatsApp, Custom Message, Show Unit Sold.
  const [releaseAtEditId, setReleaseAtEditId] = useState<string | null>(null);
  const [releaseAtDraft, setReleaseAtDraft] = useState("");
  const [savingReleaseAt, setSavingReleaseAt] = useState(false);

  const [notifyWhatsappEditId, setNotifyWhatsappEditId] = useState<string | null>(null);
  const [notifyWhatsappEnabledDraft, setNotifyWhatsappEnabledDraft] = useState(false);
  const [notifyWhatsappMessageDraft, setNotifyWhatsappMessageDraft] = useState("");
  const [savingNotifyWhatsapp, setSavingNotifyWhatsapp] = useState(false);

  const [successMessageEditId, setSuccessMessageEditId] = useState<string | null>(null);
  const [successMessageDraft, setSuccessMessageDraft] = useState("");
  const [savingSuccessMessage, setSavingSuccessMessage] = useState(false);

  useEffect(() => {
    Promise.all([getMyPage(), listProducts(), listCollaborators()])
      .then(([p, prod, collabs]) => {
        setPage(p);
        setProducts(prod);
        setActiveCollaborators(collabs.filter((c) => c.status === "active" && c.collaborator_user_id));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.loadProducts")))
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

  // Modul multi-Toko Fase 2 (permintaan langsung pengguna, 28 Agustus 2026:
  // "Tetap di menu Toko (Produk & Monetisasi)" -- jawaban AskUserQuestion
  // soal ke mana perpindah pembuatan Toko ke-2..5 setelah /dashboard/pages
  // dihapus & digantikan pill "+ Page" di Link Bio KHUSUS Bio/Landing).
  // allTokoPages -- SEMUA halaman page_type "produk" milik akun (canonical +
  // multi-brand Premium), activeTokoPageId null berarti sedang menampilkan
  // canonical (perilaku default, sama seperti sebelum modul ini ada).
  const [allTokoPages, setAllTokoPages] = useState<ExtraPage[]>([]);
  const [activeTokoPageId, setActiveTokoPageId] = useState<string | null>(null);
  const [creatingTokoPage, setCreatingTokoPage] = useState(false);
  const [newTokoPageTitle, setNewTokoPageTitle] = useState("");
  const [savingNewTokoPage, setSavingNewTokoPage] = useState(false);

  // loadTokoData -- murni ambil & kembalikan data, TANPA setState di
  // dalamnya (aturan lint react-hooks/set-state-in-effect, lihat catatan
  // yang sama di commit sebelumnya). targetId -- Toko mana yang mau
  // ditampilkan; kosong/tidak ketemu jatuh balik ke canonical (Toko pertama
  // yang otomatis dibuat begitu produk pertama ada).
  //
  // Bug regresi KEDUA ditemukan lewat verifikasi browser live, 9 September
  // 2026 (susulan langsung field "URL Toko" baru yang bisa diisi bebas,
  // PagePreview.tsx/ProdukPageEditor.tsx): begitu slug Toko canonical
  // diganti manual jadi APA PUN (bukan lagi "produk" atau username), cek
  // slug di sini SELALU gagal cocok -- canonical jadi null WALAU Toko-nya
  // published & aktif, tab "Halaman Toko" salah menampilkan "Halaman Toko
  // belum aktif" tanpa jalan keluar (tombol "Buat sekarang" ditolak 403
  // karena akun sudah py 1 Toko). Akar masalahnya: TIDAK ADA field apa pun
  // di respons API ini (id/name/slug/bio/theme/is_published/page_type,
  // lihat ListMyPages di page.go) yang menandai "ini Toko pertama/auto"
  // secara independen dari slug -- begitu slug boleh diganti bebas,
  // pencocokan pola slug jadi rapuh selamanya. Diganti jadi: kalau CUMA
  // ADA SATU Toko (kasus gratis, mayoritas akun -- freeProdukPageLimit=1
  // memastikan ini), itu PASTI canonical, apa pun slug-nya sekarang.
  // Premium multi-brand (>1 Toko) tetap coba cocokkan pola lama dulu
  // (kompatibel akun yang belum pernah mengganti slug canonical-nya),
  // fallback ke entri pertama (ORDER BY name ASC, ListMyPages) kalau
  // semua entri ternyata sudah diganti -- lebih baik menampilkan Toko yang
  // salah daripada tidak menampilkan sama sekali.
  async function loadTokoData(targetId?: string | null) {
    const profile = await getSettingsProfile();
    const pages = await listMyExtraPages();
    const tokoPages = pages.filter((p) => p.page_type === "produk");
    const canonical =
      tokoPages.length <= 1
        ? (tokoPages[0] ?? null)
        : (tokoPages.find((p) => p.slug === "produk" || p.slug === profile.username) ?? tokoPages[0] ?? null);
    const target = (targetId && tokoPages.find((p) => p.id === targetId)) || canonical;
    if (!target) {
      return { username: profile.username, page: null as ExtraPageDetail | null, links: [] as LinkItem[], tokoPages, activeId: null as string | null };
    }
    const [detail, pageLinks] = await Promise.all([getExtraPage(target.id), listExtraPageLinks(target.id)]);
    return { username: profile.username, page: detail, links: pageLinks, tokoPages, activeId: target.id };
  }

  const applyTokoResult = useCallback((result: Awaited<ReturnType<typeof loadTokoData>>) => {
    setTokoUsername(result.username);
    setTokoPage(result.page);
    setTokoLinks(result.links);
    setAllTokoPages(result.tokoPages);
    setActiveTokoPageId(result.activeId);
  }, []);

  useEffect(() => {
    loadTokoData()
      .then(applyTokoResult)
      .catch((err) => setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.loadTokoPage")))
      .finally(() => setTokoLoading(false));
  }, [applyTokoResult]);

  async function handleCreateTokoNow() {
    setTokoError(null);
    setTokoCreating(true);
    try {
      await createExtraPage({ name: `Toko ${tokoUsername}`, slug: tokoUsername, page_type: "produk" });
      applyTokoResult(await loadTokoData());
    } catch (err) {
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createTokoPage"));
    } finally {
      setTokoCreating(false);
    }
  }

  async function switchToTokoPage(id: string) {
    if (tokoLoading || id === activeTokoPageId) return;
    setTokoLoading(true);
    setTokoError(null);
    try {
      applyTokoResult(await loadTokoData(id));
    } catch (err) {
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.loadTokoPage"));
    } finally {
      setTokoLoading(false);
    }
  }

  async function handleCreateAdditionalToko(e: React.FormEvent) {
    e.preventDefault();
    const title = newTokoPageTitle.trim();
    if (!title || savingNewTokoPage) return;
    setSavingNewTokoPage(true);
    setTokoError(null);
    const baseSlug = slugifyTitle(title, "toko");
    let slug = baseSlug;
    try {
      let created: { id: string; message: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          created = await createExtraPage({ name: title, slug, page_type: "produk" });
          break;
        } catch (err) {
          const isSlugTaken = err instanceof ApiError && err.status === 409;
          if (!isSlugTaken || attempt === 4) throw err;
          slug = `${baseSlug}-${Math.floor(1000 + attempt * 137 + title.length * 7).toString(36)}`;
        }
      }
      if (!created) return;
      setNewTokoPageTitle("");
      setCreatingTokoPage(false);
      applyTokoResult(await loadTokoData(created.id));
    } catch (err) {
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createNewToko"));
    } finally {
      setSavingNewTokoPage(false);
    }
  }

  async function handleTogglePagePublish(target: ExtraPage) {
    const next = !target.is_published;
    setAllTokoPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, is_published: next } : p)));
    if (activeTokoPageId === target.id) setTokoPage((prev) => (prev ? { ...prev, is_published: next } : prev));
    try {
      await updateExtraPage(target.id, { is_published: next });
    } catch (err) {
      setAllTokoPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, is_published: !next } : p)));
      if (activeTokoPageId === target.id) setTokoPage((prev) => (prev ? { ...prev, is_published: !next } : prev));
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.togglePublish"));
    }
  }

  async function handleDeleteAdditionalToko(target: ExtraPage) {
    const ok = await confirmDelete(
      t("dashboard.pages.products.confirm.deleteTokoTitle").replace("{name}", target.name),
      {
        confirmButtonText: t("dashboard.pages.products.confirm.deleteTokoButton"),
      }
    );
    if (!ok) return;
    const previous = allTokoPages;
    setAllTokoPages((prev) => prev.filter((p) => p.id !== target.id));
    try {
      await deleteExtraPage(target.id);
      if (activeTokoPageId === target.id) applyTokoResult(await loadTokoData());
    } catch (err) {
      setAllTokoPages(previous);
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.deleteToko"));
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
      setTokoError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.saveStickers"));
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
      .catch((err) => setOverviewError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.loadOverview")));
  }, [overviewRangeDays]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError(t("dashboard.pages.products.errors.nameAndPriceRequired"));
      return;
    }
    if (!coverFile) {
      setError(t("dashboard.pages.products.errors.coverRequired"));
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
      // Refetch Halaman Toko HANYA kalau sebelumnya belum ada (tokoPage
      // masih null) -- bug ditemukan lewat audit 22 Agustus 2026: Toko
      // otomatis dibuat backend begitu produk PERTAMA ada (ensureProdukPage),
      // tapi loadTokoData() di sini cuma jalan SEKALI saat mount (useEffect
      // dependency [applyTokoResult] stabil), jadi tab "Halaman Toko" tetap
      // menampilkan "belum aktif" walau Toko-nya SUDAH ada di database
      // sampai kreator me-reload manual. Kondisional (bukan refetch tiap
      // create) supaya tidak ada permintaan API sia-sia begitu Toko memang
      // sudah ada dari sebelumnya.
      if (!tokoPage) applyTokoResult(await loadTokoData());
      setName("");
      setPriceIDR("");
      setCategory("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createProduct"));
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
      setError(t("dashboard.pages.products.errors.nameAndPriceRequiredShort"));
      return;
    }
    if (!coverFile) {
      setError(t("dashboard.pages.products.errors.coverRequired"));
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
      // Lihat catatan lengkap di handleCreate (produk Digital) di atas.
      if (!tokoPage) applyTokoResult(await loadTokoData());
      setName("");
      setPriceIDR("");
      setCategory("");
      setSuccessMessage("");
      setPaymentLimitCount("");
      setLinkExpiresAt("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createPaymentLink"));
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
    // Harga OPSIONAL khusus jenis ini -- permintaan langsung pengguna, 20
    // Agustus 2026: "untuk produk affiliate harga jadikan optional" (link
    // afiliasi tidak pernah lewat checkout Jeonme, harga di sini murni
    // informasi tampilan). Kalau diisi, tetap harus masuk akal (>= Rp1.000)
    // -- validasi min TETAP jalan, cuma boleh dikosongkan sama sekali.
    const priceTrimmed = priceIDR.trim();
    const price = priceTrimmed ? Number(priceTrimmed) : undefined;
    if (!name.trim()) {
      setError(t("dashboard.pages.products.errors.nameRequired"));
      return;
    }
    if (price !== undefined && price < 1000) {
      setError(t("dashboard.pages.products.errors.priceOptionalMin"));
      return;
    }
    if (!externalUrl.trim()) {
      setError(t("dashboard.pages.products.errors.productUrlRequired"));
      return;
    }
    if (!coverFile) {
      setError(t("dashboard.pages.products.errors.coverRequired"));
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
      // Lihat catatan lengkap di handleCreate (produk Digital) di atas.
      if (!tokoPage) applyTokoResult(await loadTokoData());
      setName("");
      setPriceIDR("");
      setCategory("");
      setExternalUrl("");
      setCoverFile(null);
      setAddMode("closed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createExternalLink"));
    } finally {
      setCreating(false);
    }
  }

  function startExternalUrlEdit(product: DashboardProduct) {
    setExternalUrlEditId(product.id);
    setExternalUrlDraft(product.external_url);
  }

  // handleSaveExternalUrl -- ubah tautan produk external_link yang SUDAH
  // ada (lewat modal Kelola) -- lihat catatan di externalUrlEditId.
  async function handleSaveExternalUrl(product: DashboardProduct) {
    if (!externalUrlDraft.trim()) {
      setError(t("dashboard.pages.products.errors.urlCannotBeEmpty"));
      return;
    }
    setError(null);
    setSavingExternalUrl(true);
    try {
      await updateProduct(product.id, { external_url: externalUrlDraft.trim() });
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, external_url: externalUrlDraft.trim() } : p)));
      setExternalUrlEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.saveUrl"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.uploadFile"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.uploadCover"));
    } finally {
      setCoverBusyId(null);
    }
  }

  async function handleToggleActive(product: DashboardProduct) {
    if (!product.has_file && !product.is_active) {
      setError(t("dashboard.pages.products.errors.uploadFileBeforeActivate"));
      return;
    }
    const nextActive = !product.is_active;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p)));
    try {
      await updateProduct(product.id, { is_active: nextActive });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: product.is_active } : p)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateProductStatus"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateWatermark"));
    }
  }

  function closeManageModal() {
    setManageProductId(null);
    setFlashSaleEditId(null);
    setPwywEditId(null);
    setSplitsEditId(null);
    setCategoryEditId(null);
    setReleaseAtEditId(null);
    setNotifyWhatsappEditId(null);
    setSuccessMessageEditId(null);
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.saveCategory"));
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDelete(product: DashboardProduct) {
    if (!(await confirmDelete(t("dashboard.pages.products.confirm.deleteProductTitle").replace("{name}", product.name)))) return;
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    closeManageModal();
    try {
      await deleteProduct(product.id);
    } catch (err) {
      setProducts(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.deleteProduct"));
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
      setError(t("dashboard.pages.products.errors.flashPriceInvalid"));
      return;
    }
    if (!flashStart || !flashEnd) {
      setError(t("dashboard.pages.products.errors.flashTimeRequired"));
      return;
    }
    const startsAt = new Date(flashStart).toISOString();
    const endsAt = new Date(flashEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError(t("dashboard.pages.products.errors.flashTimeOrder"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.scheduleFlashSale"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.cancelFlashSale"));
    }
  }

  function openPwywForm(product: DashboardProduct) {
    setPwywEditId(product.id);
    setPwywMinPrice(product.pwyw_min_price_idr ? String(product.pwyw_min_price_idr) : "");
  }

  async function handleSavePwyw(product: DashboardProduct) {
    const minPrice = Number(pwywMinPrice);
    if (!minPrice || minPrice < 1000) {
      setError(t("dashboard.pages.products.errors.pwywMinRequired"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.enablePwyw"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.disablePwyw"));
    }
  }

  function openReleaseAtForm(product: DashboardProduct) {
    setReleaseAtEditId(product.id);
    setReleaseAtDraft(product.release_at ? product.release_at.slice(0, 16) : "");
  }

  async function handleSaveReleaseAt(product: DashboardProduct) {
    if (!releaseAtDraft) {
      setError(t("dashboard.pages.products.errors.releaseTimeRequired"));
      return;
    }
    setError(null);
    setSavingReleaseAt(true);
    try {
      await updateProduct(product.id, { release_at: new Date(releaseAtDraft).toISOString() });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setReleaseAtEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.scheduleRelease"));
    } finally {
      setSavingReleaseAt(false);
    }
  }

  async function handleClearReleaseAt(product: DashboardProduct) {
    setError(null);
    try {
      await updateProduct(product.id, { clear_release_at: true });
      const refreshed = await listProducts();
      setProducts(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.cancelRelease"));
    }
  }

  async function handleToggleTransactionFee(product: DashboardProduct) {
    const next = !product.transaction_fee_enabled;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, transaction_fee_enabled: next } : p)));
    try {
      await updateProduct(product.id, { transaction_fee_enabled: next });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, transaction_fee_enabled: product.transaction_fee_enabled } : p)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateTransactionFee"));
    }
  }

  function openNotifyWhatsappForm(product: DashboardProduct) {
    setNotifyWhatsappEditId(product.id);
    setNotifyWhatsappEnabledDraft(product.notify_whatsapp_enabled);
    setNotifyWhatsappMessageDraft(product.notify_whatsapp_message);
  }

  async function handleSaveNotifyWhatsapp(product: DashboardProduct) {
    setError(null);
    setSavingNotifyWhatsapp(true);
    try {
      await updateProduct(product.id, {
        notify_whatsapp_enabled: notifyWhatsappEnabledDraft,
        notify_whatsapp_message: notifyWhatsappMessageDraft.trim(),
      });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setNotifyWhatsappEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateNotifyWhatsapp"));
    } finally {
      setSavingNotifyWhatsapp(false);
    }
  }

  function openSuccessMessageForm(product: DashboardProduct) {
    setSuccessMessageEditId(product.id);
    setSuccessMessageDraft(product.success_message);
  }

  async function handleSaveSuccessMessage(product: DashboardProduct) {
    setError(null);
    setSavingSuccessMessage(true);
    try {
      await updateProduct(product.id, { success_message: successMessageDraft.trim() });
      const refreshed = await listProducts();
      setProducts(refreshed);
      setSuccessMessageEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateSuccessMessage"));
    } finally {
      setSavingSuccessMessage(false);
    }
  }

  async function handleToggleShowSoldCount(product: DashboardProduct) {
    const next = !product.show_sold_count;
    setError(null);
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, show_sold_count: next } : p)));
    try {
      await updateProduct(product.id, { show_sold_count: next });
    } catch (err) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, show_sold_count: product.show_sold_count } : p)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.updateShowSoldCount"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.saveSplits"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.createDownloadLink"));
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
        {/* Tab bar dua tingkat (SPEC §13.1, Phase 5): primer Ringkasan|
            Produk|Pesanan|Halaman Toko + menu "Lainnya" (Ulasan/Listing/
            Storage/Webhook/Settings) menggantikan 9 tab sejajar yang
            overload (audit §2.2). Semua view tetap deep-linkable via
            ?tab= (§13.8). */}
        <div className="flex items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                { key: "overview" as ProductsTab, label: t("dashboard.nav.salesOverview") },
                { key: "manage" as ProductsTab, label: t("dashboard.nav.salesProducts") },
                { key: "transaction" as ProductsTab, label: t("dashboard.nav.salesOrders") },
                { key: "halaman_toko" as ProductsTab, label: t("dashboard.pages.products.tabs.halamanToko") },
              ]
            ).map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => {
                  setMoreTabsOpen(false);
                  setTabAndUrl(tb.key);
                }}
                className={`flex-shrink-0 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-semibold ${
                  tab === tb.key ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
                }`}
              >
                {tb.label}
              </button>
            ))}
            <div className="relative flex-shrink-0" ref={moreTabsRef}>
              <button
                type="button"
                onClick={() => setMoreTabsOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreTabsOpen}
                className={`flex items-center gap-1 whitespace-nowrap border-b-[3px] px-3 py-2 text-sm font-semibold ${
                  MORE_TABS.includes(tab)
                    ? "border-jeon-purple text-jeon-purple"
                    : "border-transparent text-app-muted hover:text-app-ink"
                }`}
              >
                {MORE_TABS.includes(tab)
                  ? t(`dashboard.pages.products.tabs.${MORE_TAB_LABEL_KEY[tab] ?? "more"}`)
                  : t("dashboard.pages.products.tabs.more")}
                <IconChevronRight className={`h-3.5 w-3.5 transition-transform ${moreTabsOpen ? "rotate-90" : ""}`} />
              </button>
              {moreTabsOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-[calc(100%+0.25rem)] z-30 w-44 overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface py-1.5 shadow-card"
                >
                  {MORE_TABS.map((mt) => (
                    <button
                      key={mt}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreTabsOpen(false);
                        setTabAndUrl(mt);
                      }}
                      className={`block w-full px-4 py-2 text-left text-sm font-semibold hover:bg-app-surface-2 ${
                        tab === mt ? "text-jeon-purple" : "text-app-ink"
                      }`}
                    >
                      {t(`dashboard.pages.products.tabs.${MORE_TAB_LABEL_KEY[mt]}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        {tab === "halaman_toko" ? (
          <div className="mt-4">
            {/* Pill switcher multi-Toko -- Modul Halaman Tambahan Fase 2
                (jawaban AskUserQuestion langsung pengguna, 28 Agustus 2026:
                "Tetap di menu Toko (Produk & Monetisasi)"). Disembunyikan
                kalau cuma ada 1 Toko (canonical) DAN akun bukan Premium --
                supaya kreator gratis dengan 1 Toko biasa tidak melihat UI
                switcher yang tidak relevan untuk mereka. Syarat length >= 1
                MENCEGAH tombol "+ Toko" muncul SEBELUM Toko canonical ada
                sama sekali (mis. akun Premium yang belum pernah menambahkan
                produk) -- kalau dibolehkan, klik "+ Toko" bisa membuat Toko
                PERTAMA dengan slug bebas (bukan slug=username), bentrok
                dengan alur canonical "Buat Halaman Toko sekarang" di bawah
                yang sengaja slug-nya SELALU = username. */}
            {allTokoPages.length >= 1 && (allTokoPages.length > 1 || page?.is_premium) && (
              <>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.products.tokoLabel")}</p>
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {allTokoPages.map((tp) => (
                    <button
                      key={tp.id}
                      type="button"
                      onClick={() => switchToTokoPage(tp.id)}
                      disabled={tokoLoading || activeTokoPageId === tp.id}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors disabled:cursor-default ${
                        activeTokoPageId === tp.id ? "bg-jeon-sidebar text-white" : "bg-surface-2 text-app-muted hover:text-app-ink"
                      }`}
                    >
                      {tp.name}
                      {!tp.is_published && (
                        <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">
                          {t("dashboard.pages.products.draft")}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (!page?.is_premium) {
                        router.push("/dashboard/settings/subscription");
                        return;
                      }
                      if (allTokoPages.length >= PREMIUM_PRODUK_PAGE_LIMIT) {
                        setTokoError(
                          t("dashboard.pages.products.errors.tokoLimitReached").replace("{limit}", String(PREMIUM_PRODUK_PAGE_LIMIT))
                        );
                        return;
                      }
                      setNewTokoPageTitle("");
                      setCreatingTokoPage(true);
                    }}
                    title={!page?.is_premium ? t("dashboard.pages.products.premiumOnlyTitle") : undefined}
                    className="flex items-center gap-1 rounded-full border border-dashed border-app-border px-3 py-1.5 text-sm font-bold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
                  >
                    <IconPlus className="h-3.5 w-3.5" />
                    {t("dashboard.pages.products.tokoLabel")}
                    {!page?.is_premium && <IconSparkle className="h-3 w-3 text-jeon-purple" />}
                  </button>
                </div>
                {(() => {
                  const activeTp = allTokoPages.find((p) => p.id === activeTokoPageId);
                  if (!activeTp) return null;
                  return (
                    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-muted">
                      <label className="flex items-center gap-1.5">
                        <Toggle checked={activeTp.is_published} onChange={() => handleTogglePagePublish(activeTp)} />
                        {t("dashboard.pages.products.publish")}
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDeleteAdditionalToko(activeTp)}
                        className="flex items-center gap-1 text-red-500 hover:underline"
                      >
                        <IconTrash className="h-3 w-3" /> {t("dashboard.pages.products.deleteThisToko")}
                      </button>
                    </div>
                  );
                })()}
              </>
            )}
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
              <div className="glass mb-4 flex items-center gap-3 rounded-jlg p-4 shadow-card">
                {page.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={page.avatar_url} alt={page.username} className="h-11 w-11 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-jeon-purple/10 text-sm font-bold text-jeon-purple">
                    {page.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-app-ink">{page.display_name || `@${page.username}`}</p>
                  <a
                    href={`${SITE_URL}/${page.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-xs text-jeon-purple hover:underline"
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
                      ? "border-jeon-purple border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
                      : "border-app-border text-app-muted hover:border-jeon-purple/50"
                  }`}
                >
                  {t("dashboard.pages.products.rangeDays").replace("{days}", String(d))}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {summary ? (
                <ShopOverviewPanel summary={summary} recentOrders={recentOrders} />
              ) : (
                // KpiSkeleton+ChartSkeleton (bukan PageSkeleton) -- laporan
                // pengguna 3 September 2026: "terasa loading 2x". Akar
                // masalah: tab ini sudah lewat gerbang `if (loading) return
                // <PageSkeleton />` di atas (daftar produk termuat), TAPI
                // summary/recentOrders dimuat lewat effect TERPISAH yang
                // lebih lambat -- begitu chrome halaman (tab, header) sudah
                // tampil, area ini menampilkan PageSkeleton yang SAMA PERSIS
                // bentuknya (judul + 3 bar besar) dengan skeleton awal, jadi
                // terlihat seperti "halaman reset & memuat ulang" padahal
                // cuma satu panel kecil yang masih menunggu. Bentuk baru ini
                // meniru KPI grid + grafik ShopOverviewPanel yang sungguhan,
                // jadi transisinya terasa "detail muncul", bukan "ulang
                // dari nol".
                <div className="flex flex-col gap-3">
                  <KpiSkeleton count={3} />
                  <ChartSkeleton />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-app-muted">{t("dashboard.pages.products.uploadHint")}</p>


            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                <div className="relative flex-1 sm:max-w-xs">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-app-muted" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setItemsPage(1);
                    }}
                    placeholder={t("dashboard.pages.products.searchPlaceholder")}
                    className="w-full rounded-lg border border-app-border bg-app-surface py-2 pl-8 pr-3 text-xs focus:border-jeon-purple focus:outline-none"
                  />
                </div>
                {categories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setItemsPage(1);
                    }}
                    className="rounded-lg border border-app-border bg-app-surface px-3 py-2 text-xs focus:border-jeon-purple focus:outline-none"
                  >
                    <option value="">{t("dashboard.pages.products.allCategories")}</option>
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
                  {t("dashboard.pages.products.addProduct")}
                </button>
              )}
            </div>

            {/* Modul Toko (Fase B3): panel "Add Items" ala referensi -- pilih
                jenis item dulu sebelum masuk ke form spesifiknya. */}
            {addMode === "choose" && (
              <div className="glass mt-3 grid grid-cols-1 gap-2.5 rounded-jlg p-4 shadow-card sm:grid-cols-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple sm:col-span-3">
                  {t("dashboard.pages.products.createStep1")}
                </p>
                <button
                  type="button"
                  onClick={() => setAddMode("digital")}
                  className="flex flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
                >
                  <IconUpload className="h-5 w-5 text-jeon-purple" />
                  <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.digitalTitle")}</span>
                  <span className="text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.digitalDesc")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("payment_link")}
                  className="flex flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
                >
                  <IconWallet className="h-5 w-5 text-jeon-purple" />
                  <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.paymentLinkTitle")}</span>
                  <span className="text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.paymentLinkDesc")}</span>
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
                  className="flex flex-col items-start gap-1 rounded-xl border-2 border-jeon-ink p-3.5 text-left hover:border-jeon-purple"
                >
                  <IconExternal className="h-5 w-5 text-jeon-purple" />
                  <span className="text-sm font-bold text-app-ink">{t("dashboard.pages.products.addChoose.externalLinkTitle")}</span>
                  <span className="text-[11px] text-app-muted">{t("dashboard.pages.products.addChoose.externalLinkDesc")}</span>
                </button>
              </div>
            )}

            {addMode === "digital" && (
              <form onSubmit={handleCreate} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">
                  {t("dashboard.pages.products.createStep2")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder={t("dashboard.pages.products.form.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <input
                    type="number"
                    required
                    placeholder={t("dashboard.pages.products.form.pricePlaceholder")}
                    min={1000}
                    value={priceIDR}
                    onChange={(e) => setPriceIDR(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <input
                    type="text"
                    placeholder={t("dashboard.pages.products.form.categoryPlaceholder")}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
                {renderCoverPicker(coverFile, setCoverFile, t)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.create")}
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
                    className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
                  >
                    {t("dashboard.pages.products.form.cancel")}
                  </button>
                </div>
              </form>
            )}

            {addMode === "payment_link" && (
              <form onSubmit={handleCreatePaymentLink} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">
                  {t("dashboard.pages.products.createStep2")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder={t("dashboard.pages.products.form.titlePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <input
                    type="number"
                    required
                    placeholder={t("dashboard.pages.products.form.pricePlaceholder")}
                    min={1000}
                    value={priceIDR}
                    onChange={(e) => setPriceIDR(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
                <textarea
                  placeholder={t("dashboard.pages.products.form.successMessagePlaceholder")}
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="number"
                    min={1}
                    placeholder={t("dashboard.pages.products.form.paymentLimitPlaceholder")}
                    value={paymentLimitCount}
                    onChange={(e) => setPaymentLimitCount(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <input
                    type="datetime-local"
                    value={linkExpiresAt}
                    onChange={(e) => setLinkExpiresAt(e.target.value)}
                    title={t("dashboard.pages.products.form.linkExpiresTitle")}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
                {renderCoverPicker(coverFile, setCoverFile, t)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.createPaymentLink")}
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
                    className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
                  >
                    {t("dashboard.pages.products.form.cancel")}
                  </button>
                </div>
              </form>
            )}

            {addMode === "external_link" && (
              <form onSubmit={handleCreateExternalLink} className="glass mt-3 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-jeon-purple">
                  {t("dashboard.pages.products.createStep2")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder={t("dashboard.pages.products.form.namePlaceholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                  <input
                    type="number"
                    placeholder={t("dashboard.pages.products.form.priceOptionalPlaceholder")}
                    min={1000}
                    value={priceIDR}
                    onChange={(e) => setPriceIDR(e.target.value)}
                    className="flex-1 rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                  />
                </div>
                <input
                  type="url"
                  required
                  placeholder={t("dashboard.pages.products.form.externalUrlPlaceholder")}
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
                <input
                  type="text"
                  placeholder={t("dashboard.pages.products.form.categoryPlaceholder")}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
                {renderCoverPicker(coverFile, setCoverFile, t)}
                <div className="flex gap-2">
                  <button type="submit" disabled={creating} className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {creating ? t("dashboard.pages.products.form.creating") : t("dashboard.pages.products.form.createProductButton")}
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
                    className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
                  >
                    {t("dashboard.pages.products.form.cancel")}
                  </button>
                </div>
              </form>
            )}

            {filteredProducts.length > 0 ? (
              <div className="glass mt-4 overflow-x-auto rounded-jlg shadow-card">
                <table aria-label={t("dashboard.pages.products.table.ariaLabel")} className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b-2 border-jeon-ink text-[11px] font-semibold uppercase tracking-wide text-app-muted">
                      <th className="px-4 py-3">{t("dashboard.pages.products.table.item")}</th>
                      <th className="px-4 py-3">{t("dashboard.pages.products.table.price")}</th>
                      <th className="px-4 py-3">{t("dashboard.pages.products.table.sold")}</th>
                      {/* Diklik -- permintaan langsung pengguna, 13 Agustus
                          2026: "di link bio dan juga product tambahkan
                          dibagian bawah statistik berapa kali jumlah klik
                          per bloknya" -- jumlah klik NYATA dari
                          analytics_events (event_type="product_click"),
                          kolom baru di sebelah "Terjual", pola sama persis
                          (dihitung backend, bukan angka rekaan). */}
                      <th className="px-4 py-3">{t("dashboard.pages.products.table.clicked")}</th>
                      <th className="px-4 py-3">{t("dashboard.pages.products.table.status")}</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedProducts.map((p) => (
                      <tr key={p.id} className="border-b border-app-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-jeon-purple/10">
                              {p.cover_image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.cover_image_url} alt={p.name} className="h-full w-full object-cover" />
                              ) : (
                                <IconBox className="h-4 w-4 text-jeon-purple/40" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-app-ink">{p.name}</p>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {p.product_kind === "payment_link" && (
                                  <span className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold text-[#111111]">
                                    {t("dashboard.pages.products.badges.paymentLink")}
                                  </span>
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
                                    className="flex items-center gap-0.5 rounded-full border-2 border-[#111111] bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold text-[#111111] hover:underline"
                                  >
                                    {t("dashboard.pages.products.badges.externalLink")} <IconExternal className="h-2.5 w-2.5" />
                                  </a>
                                )}
                                {p.category && (
                                  <span className="rounded-full bg-app-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-app-muted">{p.category}</span>
                                )}
                                {p.is_flash_sale_active && (
                                  <span className="rounded-full bg-jeon-warning/15 px-1.5 py-0.5 text-[9px] font-bold text-jeon-warning">
                                    {t("dashboard.pages.products.badges.flashSale")}
                                  </span>
                                )}
                                {p.pwyw_enabled && (
                                  <span className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold text-[#111111]">
                                    {t("dashboard.pages.products.badges.pwyw")}
                                  </span>
                                )}
                                {p.collaborator_splits.length > 0 && (
                                  <span className="rounded-full border-2 border-[#111111] bg-jeon-lavender px-1.5 py-0.5 text-[9px] font-bold text-[#111111]">
                                    {t("dashboard.pages.products.badges.collaboratorsCount").replace("{count}", String(p.collaborator_splits.length))}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {p.pwyw_enabled ? (
                            <span className="font-bold text-jeon-purple">
                              {t("dashboard.pages.products.minPriceLabel")} Rp {(p.pwyw_min_price_idr ?? 0).toLocaleString("id-ID")}
                            </span>
                          ) : p.is_flash_sale_active ? (
                            <span>
                              <span className="mr-1 text-app-muted line-through">Rp {p.price_idr.toLocaleString("id-ID")}</span>
                              <span className="font-bold text-jeon-warning">Rp {p.effective_price_idr.toLocaleString("id-ID")}</span>
                            </span>
                          ) : p.product_kind === "external_link" && p.price_idr === 0 ? (
                            // Harga opsional khusus Link Eksternal (permintaan
                            // langsung pengguna, 20 Agustus 2026) -- 0 di sini
                            // berarti sengaja tidak diisi, bukan produk gratis
                            // Rp0 sungguhan (jenis lain harga tetap wajib >= 1000).
                            <span className="text-app-muted">{t("dashboard.pages.products.notShown")}</span>
                          ) : (
                            <span className="font-bold text-app-ink">Rp {p.price_idr.toLocaleString("id-ID")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top text-app-ink">{p.sold_count.toLocaleString("id-ID")}</td>
                        <td className="px-4 py-3 align-top text-app-muted">{p.click_count.toLocaleString("id-ID")}</td>
                        <td className="px-4 py-3 align-top">
                          <Toggle
                            checked={p.is_active}
                            onChange={() => handleToggleActive(p)}
                            disabled={!p.has_file && !p.is_active}
                            label={t("dashboard.pages.products.activateToggleLabel").replace("{name}", p.name)}
                          />
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <button
                            type="button"
                            onClick={() => setManageProductId(p.id)}
                            className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
                          >
                            {t("dashboard.pages.products.manage")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : products.length > 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-app-border p-4 text-center text-xs text-app-muted">
                {t("dashboard.pages.products.noProductsMatch")}
              </p>
            ) : (
              <EmptyState
                className="mt-4"
                icon={IconBox}
                accent="lime"
                title={t("dashboard.pages.products.emptyTitle")}
                text={t("dashboard.pages.products.emptyState")}
                ctaLabel={t("dashboard.pages.products.addProduct")}
                onCtaClick={() => setAddMode("choose")}
              />
            )}

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setItemsPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple disabled:opacity-40"
                >
                  {t("dashboard.pages.products.pagination.previous")}
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setItemsPage(n)}
                    className={`h-8 w-8 rounded-lg text-xs font-semibold ${
                      n === currentPage ? "btn-primary text-white" : "text-app-ink hover:bg-jeon-purple/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setItemsPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border-2 border-jeon-ink px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-jeon-purple disabled:opacity-40"
                >
                  {t("dashboard.pages.products.pagination.next")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal "+ Toko" -- hanya minta judul (pola sama "+ Page" Link Bio),
          slug diturunkan otomatis (slugifyTitle) dengan retry tabrakan di
          handleCreateAdditionalToko. Toko ke-2..5 (Premium, multi-brand). */}
      {creatingTokoPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setCreatingTokoPage(false)}>
          <form
            onSubmit={handleCreateAdditionalToko}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal"
          >
            <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.products.newTokoModal.title")}</h2>
            <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.products.newTokoModal.description")}</p>
            <input
              type="text"
              autoFocus
              value={newTokoPageTitle}
              onChange={(e) => setNewTokoPageTitle(e.target.value)}
              placeholder={t("dashboard.pages.products.newTokoModal.namePlaceholder")}
              maxLength={80}
              className="mt-3 w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCreatingTokoPage(false)}
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:bg-app-surface-2"
              >
                {t("dashboard.pages.products.newTokoModal.cancel")}
              </button>
              <button
                type="submit"
                disabled={!newTokoPageTitle.trim() || savingNewTokoPage}
                className="flex-1 rounded-lg btn-primary py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingNewTokoPage ? t("dashboard.pages.products.newTokoModal.creating") : t("dashboard.pages.products.newTokoModal.create")}
              </button>
            </div>
          </form>
        </div>
      )}

      <LivePreviewPanel
        page={tokoPreviewPage}
        links={tokoLinks}
        products={products}
        pageType="produk"
        pageSlug={tokoPage?.slug}
        openUrl={tokoPage ? `${SITE_URL}/${tokoUsername}/${tokoPage.slug}` : undefined}
        editableStickers={tab === "halaman_toko" && tokoSection === "stiker"}
        onStickersChange={handleTokoStickersChange}
      />

      {manageProduct && (
        <ManageProductModal
          product={manageProduct}
          onClose={closeManageModal}
          categoryEditId={categoryEditId}
          categoryDraft={categoryDraft}
          savingCategory={savingCategory}
          onCategoryDraftChange={setCategoryDraft}
          onCancelCategoryEdit={() => setCategoryEditId(null)}
          onSaveCategory={handleSaveCategory}
          onOpenCategoryForm={openCategoryForm}
          coverBusyId={coverBusyId}
          onUploadCover={handleUploadCover}
          busyId={busyId}
          onUpload={handleUpload}
          onGetDownloadLink={handleGetDownloadLink}
          onToggleWatermark={handleToggleWatermark}
          flashSaleEditId={flashSaleEditId}
          flashPrice={flashPrice}
          flashStart={flashStart}
          flashEnd={flashEnd}
          savingFlashSale={savingFlashSale}
          onFlashPriceChange={setFlashPrice}
          onFlashStartChange={setFlashStart}
          onFlashEndChange={setFlashEnd}
          onCancelFlashSaleEdit={() => setFlashSaleEditId(null)}
          onSaveFlashSale={handleSaveFlashSale}
          onClearFlashSale={handleClearFlashSale}
          onOpenFlashSaleForm={openFlashSaleForm}
          pwywEditId={pwywEditId}
          pwywMinPrice={pwywMinPrice}
          savingPwyw={savingPwyw}
          onPwywMinPriceChange={setPwywMinPrice}
          onCancelPwywEdit={() => setPwywEditId(null)}
          onSavePwyw={handleSavePwyw}
          onClearPwyw={handleClearPwyw}
          onOpenPwywForm={openPwywForm}
          activeCollaborators={activeCollaborators}
          splitsEditId={splitsEditId}
          splitRows={splitRows}
          savingSplits={savingSplits}
          onUpdateSplitRow={updateSplitRow}
          onRemoveSplitRow={(index) => setSplitRows((prev) => prev.filter((_, idx) => idx !== index))}
          onAddSplitRow={() => setSplitRows((prev) => [...prev, { user_id: "", percent: 0 }])}
          onCancelSplitsEdit={() => setSplitsEditId(null)}
          onSaveSplits={handleSaveSplits}
          onOpenSplitsForm={openSplitsForm}
          externalUrlEditId={externalUrlEditId}
          externalUrlDraft={externalUrlDraft}
          savingExternalUrl={savingExternalUrl}
          onExternalUrlDraftChange={setExternalUrlDraft}
          onStartExternalUrlEdit={startExternalUrlEdit}
          onCancelExternalUrlEdit={() => setExternalUrlEditId(null)}
          onSaveExternalUrl={handleSaveExternalUrl}
          onProductPatch={(patch) => setProducts((prev) => prev.map((p) => (p.id === manageProduct.id ? { ...p, ...patch } : p)))}
          onError={setError}
          onDelete={handleDelete}
          releaseAtEditId={releaseAtEditId}
          releaseAtDraft={releaseAtDraft}
          savingReleaseAt={savingReleaseAt}
          onReleaseAtDraftChange={setReleaseAtDraft}
          onCancelReleaseAtEdit={() => setReleaseAtEditId(null)}
          onSaveReleaseAt={handleSaveReleaseAt}
          onClearReleaseAt={handleClearReleaseAt}
          onOpenReleaseAtForm={openReleaseAtForm}
          onToggleTransactionFee={handleToggleTransactionFee}
          notifyWhatsappEditId={notifyWhatsappEditId}
          notifyWhatsappEnabledDraft={notifyWhatsappEnabledDraft}
          notifyWhatsappMessageDraft={notifyWhatsappMessageDraft}
          savingNotifyWhatsapp={savingNotifyWhatsapp}
          onNotifyWhatsappEnabledDraftChange={setNotifyWhatsappEnabledDraft}
          onNotifyWhatsappMessageDraftChange={setNotifyWhatsappMessageDraft}
          onCancelNotifyWhatsappEdit={() => setNotifyWhatsappEditId(null)}
          onSaveNotifyWhatsapp={handleSaveNotifyWhatsapp}
          onOpenNotifyWhatsappForm={openNotifyWhatsappForm}
          successMessageEditId={successMessageEditId}
          successMessageDraft={successMessageDraft}
          savingSuccessMessage={savingSuccessMessage}
          onSuccessMessageDraftChange={setSuccessMessageDraft}
          onCancelSuccessMessageEdit={() => setSuccessMessageEditId(null)}
          onSaveSuccessMessage={handleSaveSuccessMessage}
          onOpenSuccessMessageForm={openSuccessMessageForm}
          onToggleShowSoldCount={handleToggleShowSoldCount}
        />
      )}
    </div>
  );
}
