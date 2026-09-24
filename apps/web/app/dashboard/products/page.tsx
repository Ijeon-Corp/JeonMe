"use client";

import Image from "next/image";

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
  deleteExtraPage,
  deleteProduct,
  getAnalyticsSummary,
  getExtraPage,
  getProductDownloadURL,
  getSettingsProfile,
  listCollaborators,
  listExtraPageLinks,
  getActiveWorkspaceOwnerId,
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
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import ScrollHint from "@/components/ScrollHint";
import Toggle from "@/components/Toggle";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import type { DesignSection } from "@/components/ProdukPageEditor";
import { confirmDelete } from "@/lib/confirm";
import { useDashboardMyPage } from "@/lib/dashboard-page-context";
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
const CreateProductForm = dynamic(() => import("@/components/dashboard/products/CreateProductForm"));
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

  // Sinkron state -> URL saat klik tab internal.
  //
  // Bug dilaporkan langsung pengguna, 15 September 2026 ("saat pindah tab
  // pertama page akan menampilkan isi tab baru tapi url masih di tab lama,
  // lalu tiba-tiba reload dan baru ganti url"): `router.replace()` App
  // Router SELALU memicu Next.js melakukan round-trip navigasi (fetch RSC
  // payload rute tujuan) SEBELUM address bar sungguhan di-commit -- pada
  // halaman ini SELURUH konten tab adalah client component murni (state
  // `tab`, di atas), jadi round-trip itu tidak pernah mengubah apa pun yang
  // dirender, cuma menambah jeda ~0.3-0.6 detik antara konten yang SUDAH
  // berganti (setTab, sinkron) dengan URL yang baru menyusul belakangan --
  // persis gejala yang dilaporkan (konten Pesanan sudah tampil, URL masih
  // ?tab=items, lalu "reload" begitu round-trip itu akhirnya selesai).
  // Diganti `window.history.replaceState` (pola RESMI Next.js App Router
  // utk update search params yang tidak butuh data server baru -- lihat
  // node_modules/next/dist/docs/.../linking-and-navigating.md#native-history-api,
  // "integrate into the Next.js Router, allowing you to sync with
  // usePathname and useSearchParams") -- searchParams tetap ikut sinkron
  // (urlTab di atas tetap benar), tapi TANPA round-trip navigasi apa pun,
  // jadi address bar berubah SAAT ITU JUGA, bukan menyusul belakangan.
  // updateUrlParams -- gabung ke query string yang ADA (bukan timpa total)
  // supaya tab utama & sub-tab Toko (lihat setTokoSectionAndUrl di bawah)
  // bisa hidup berdampingan di URL yang sama tanpa saling menghapus.
  function updateUrlParams(patch: Record<string, string>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) params.set(k, v);
    window.history.replaceState(null, "", `/dashboard/products?${params.toString()}`);
  }

  function setTabAndUrl(next: ProductsTab) {
    setTab(next);
    updateUrlParams({ tab: TAB_TO_URL[next] });
  }

  // page -- audit performa 22 September 2026: SEBELUMNYA fetch getMyPage()
  // sendiri di sini, padahal dashboard/layout.tsx (ancestor langsung
  // halaman ini) SUDAH memanggilnya lebih dulu untuk kebutuhannya sendiri
  // (chip username/avatar top bar) -- pola & alasan SAMA PERSIS perbaikan
  // app/dashboard/page.tsx 21 September (lihat catatan lengkap di
  // lib/dashboard-page-context.tsx). Aman dijadikan murni nilai context --
  // `page` di file ini cuma di-`setPage` SATU kali (fetch awal), tidak
  // pernah dimutasi lokal sesudahnya di mana pun.
  const page = useDashboardMyPage();
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

  // addingProduct -- Modul Toko (Fase B3): "+ Tambah Produk" membuka panel
  // "Add Items" (Digital Product vs Payment Link vs Link Eksternal). Badan
  // alur (pilihan 3 tipe + 3 form + handler create) diekstrak ke
  // `CreateProductForm.tsx` (permintaan langsung pengguna 10 September
  // 2026, "harusnya ada blok produk" -- dipakai ulang APA ADANYA oleh blok
  // "Produk" baru di Canvas Page Builder) -- state di sini cuma boolean
  // buka/tutup, sisanya (mode 3-pilihan/field form) jadi state INTERNAL
  // komponen itu sendiri.
  const [addingProduct, setAddingProduct] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [itemsPage, setItemsPage] = useState(1);

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
  // canManageSplits -- perbaikan keamanan 24 September 2026. Backend kini
  // MENOLAK (403) perubahan bagi hasil & komisi afiliasi yang datang lewat
  // impersonasi X-Act-As-Owner, karena itu jalur pengarahan uang dan
  // kolaborator tidak boleh menyentuhnya (lihat
  // blockMoneyRoutingByCollaborator di apps/api). Gerbang di sini murni
  // UX: supaya kolaborator tidak disuguhi form yang PASTI ditolak. Ini
  // BUKAN kontrol keamanan -- backend tetap penegak sebenarnya.
  // useState lazy initializer (bukan dibaca langsung saat render) mengikuti
  // pola yang sudah dipakai dashboard/layout.tsx untuk nilai localStorage
  // yang sama.
  const [canManageSplits] = useState(() => getActiveWorkspaceOwnerId() === null);
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
    Promise.all([listProducts(), listCollaborators()])
      .then(([prod, collabs]) => {
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
  //
  // Sinkron ke URL (?section=...) -- bug UI/UX ditemukan 21 September 2026
  // (audit menyeluruh): SEBELUMNYA murni state lokal, reload membuang
  // posisi edit -- tidak konsisten dengan `tab` di atas yang sudah
  // reload-safe lewat URL. Pola APA ADANYA dari urlTab/setTabAndUrl.
  const DESIGN_SECTIONS: DesignSection[] = ["blok", "tema", "header", "tombol", "font", "stiker"];
  const urlSection = (DESIGN_SECTIONS as string[]).includes(searchParams.get("section") ?? "")
    ? (searchParams.get("section") as DesignSection)
    : "blok";
  const [tokoSection, setTokoSection] = useState<DesignSection>(urlSection);
  const [prevUrlSection, setPrevUrlSection] = useState(urlSection);
  if (urlSection !== prevUrlSection) {
    setPrevUrlSection(urlSection);
    setTokoSection(urlSection);
  }
  function setTokoSectionAndUrl(next: DesignSection) {
    setTokoSection(next);
    updateUrlParams({ section: next });
  }

  // tokoPreviewSelectId -- audit bug 22 September 2026 ("klik blok di
  // pratinjau Toko diam-diam membuka tab baru", parity dgn perbaikan
  // Simple Mode 22 September yang TIDAK PERNAH menjangkau Toko): id blok
  // yang baru diklik di kotak LivePreviewPanel di bawah, diteruskan ke
  // ProdukPageEditor (externalSelectBlockId, lihat catatan panjang di
  // sana) supaya editornya ikut terbuka -- pola sama seperti
  // section/setSection di atas (state yang dibutuhkan INDUK karena
  // pratinjau Toko dirender di sini, bukan di komponen terkontrol itu).
  const [tokoPreviewSelectId, setTokoPreviewSelectId] = useState<string | null>(null);
  // tokoActiveBlockId -- susulan 23 September 2026 ("arah sebaliknya dari
  // sorotan pratinjau ... belum ada"), arah SEBALIKNYA dari
  // tokoPreviewSelectId di atas: id blok yang SEDANG terbuka di editor
  // BlockSection (contentEditId/drilldownBlockId di sana), DILAPORKAN
  // balik lewat ProdukPageEditor.onActiveBlockChange (lihat catatan
  // panjang di ProdukPageEditor.tsx/BlockSection). Dipakai sebagai
  // LivePreviewPanel.highlightLinkId (BUKAN tokoPreviewSelectId lagi) --
  // dua state SENGAJA terpisah (bukan satu var dipakai dua arah) supaya
  // tidak ada gema balik: nilai ini TIDAK PERNAH diumpankan balik ke
  // externalSelectBlockId.
  const [tokoActiveBlockId, setTokoActiveBlockId] = useState<string | null>(null);

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
    // Promise.all -- audit performa 22 September 2026: getSettingsProfile()
    // & listMyExtraPages() TIDAK saling bergantung (profile.username cuma
    // dipakai SETELAH keduanya selesai, di percabangan multi-Toko di
    // bawah), tapi sebelumnya dijalankan berurutan -- menambah satu
    // round-trip jaringan yang sebenarnya bisa dihindari.
    const [profile, pages] = await Promise.all([getSettingsProfile(), listMyExtraPages()]);
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

  // handleProductCreated -- dipanggil `CreateProductForm.onCreated` (lihat
  // catatan lengkap di komponen itu) -- badan SAMA PERSIS bagian akhir 3
  // handler create yang lama (refetch Halaman Toko HANYA kalau sebelumnya
  // belum ada, tutup panel), cuma tambah produk baru ke `products` cukup
  // via append (bukan `listProducts()` ulang lagi -- `CreateProductForm`
  // sudah melakukan itu sendiri utk dapat objek produk lengkap).
  async function handleProductCreated(product: DashboardProduct) {
    setProducts((prev) => [...prev, product]);
    // Refetch Halaman Toko HANYA kalau sebelumnya belum ada (tokoPage
    // masih null) -- bug ditemukan lewat audit 22 Agustus 2026: Toko
    // otomatis dibuat backend begitu produk PERTAMA ada (ensureProdukPage),
    // tapi loadTokoData() di sini cuma jalan SEKALI saat mount (useEffect
    // dependency [applyTokoResult] stabil), jadi tab "Halaman Toko" tetap
    // menampilkan "belum aktif" walau Toko-nya SUDAH ada di database
    // sampai kreator me-reload manual.
    if (!tokoPage) applyTokoResult(await loadTokoData());
    setAddingProduct(false);
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
      // is_active ikut dinaikkan optimis mengikuti gerbang backend
      // (product.go: digital aktif begitu file DAN sampul ada) -- badge
      // "Nonaktif" di baris tabel langsung hilang tanpa reload.
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, has_file: true, is_pdf: isPdf, is_active: p.is_active || Boolean(p.cover_image_url) } : p)));
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
      // is_active optimis mengikuti gerbang backend: payment_link/
      // external_link aktif begitu sampul ada, digital butuh file juga.
      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, cover_image_url, is_active: p.is_active || p.product_kind === "payment_link" || p.product_kind === "external_link" || p.has_file }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.products.errors.uploadCover"));
    } finally {
      setCoverBusyId(null);
    }
  }

  // handleToggleActive (toggle status ON/OFF manual) DIHAPUS -- permintaan
  // langsung pengguna, 13 September 2026 ("hilangkan status on atau off
  // untuk menampilkan di pratinjau nya, karna saya mau ini menu untuk
  // menyimpan data produk yang nantinya bisa di fetch menggunakan blok
  // product"): menu Produk sekarang murni tempat MENYIMPAN data produk,
  // visibilitas publik sepenuhnya ditentukan blok "produk" (lihat catatan
  // lingkup lengkap di ProdukBlockEditor.tsx & Toko produk-block
  // fallback). is_active produk digital sekarang otomatis begitu file
  // diunggah (backend, product.go UploadFile) -- pola sama seperti
  // payment_link/external_link yang sudah lama auto-aktif begitu sampul
  // terunggah, tidak pernah ada toggle manual utk 2 jenis itu.

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
        {/* Bug dilaporkan langsung pengguna, 16 September 2026 ("page more
            di menu sales tidak ada isinya"): dropdown "Lainnya" (di bawah)
            posisinya `absolute`, TAPI dulu jadi ANAK LANGSUNG div
            `overflow-x-auto` yang sama dgn baris tombol tab -- per spek CSS,
            elemen yang men-set overflow-x jadi non-visible (auto/scroll)
            TANPA men-set overflow-y eksplisit membuat browser MEMAKSA
            overflow-y ikut jadi `auto` juga (tidak boleh satu sumbu
            "visible" & sumbu lain tidak) -- akibatnya dropdown yang
            menjorok ke BAWAH baris tab ikut terpotong/clip oleh tinggi
            baris itu sendiri, jadi seolah "tidak ada isinya" padahal 5
            item-nya ada di DOM & lolos cek `.toBeVisible()` Playwright
            (bounding box-nya tidak nol, cuma diam-diam ke-clip parent).
            Fix: pisah baris tab jadi DUA wrapper -- overflow-x-auto HANYA
            membungkus tombol-tombol primer yang perlu scroll horizontal di
            layar sempit, sedangkan tombol+dropdown "Lainnya" jadi SIBLING
            di luar wrapper itu (row luar tidak men-set overflow apa pun),
            supaya dropdown-nya tidak pernah ke-clip lagi. */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
          </div>
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
                  className="absolute right-0 top-[calc(100%+0.25rem)] z-30 w-44 overflow-hidden rounded-jmd border-2 border-jeon-ink bg-app-surface py-1.5 shadow-card"
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
              setSection={setTokoSectionAndUrl}
              products={products}
              onProductCreated={handleProductCreated}
              externalSelectBlockId={tokoPreviewSelectId}
              onActiveBlockChange={setTokoActiveBlockId}
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
                  // Ukuran TETAP 44px (h-11 w-11 flex-shrink-0).
                  <Image src={page.avatar_url} alt={page.username} width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5" />
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
              {!addingProduct && (
                <button
                  type="button"
                  onClick={() => setAddingProduct(true)}
                  className="btn-primary flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  {t("dashboard.pages.products.addProduct")}
                </button>
              )}
            </div>

            {/* Modul Toko (Fase B3): panel "Add Items" ala referensi -- pilih
                jenis item dulu sebelum masuk ke form spesifiknya. Badan
                alur (pilihan 3 tipe + 3 form + handler create) diekstrak
                ke CreateProductForm.tsx, lihat catatan lengkap di sana. */}
            {addingProduct && (
              <CreateProductForm
                categories={categories}
                onCreated={handleProductCreated}
                onCancel={() => setAddingProduct(false)}
                onError={setError}
              />
            )}

            {filteredProducts.length > 0 ? (
              <>
                <ScrollHint />
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
                                // Ukuran TETAP 36px -- sel tabel h-9 w-9.
                                <Image src={p.cover_image_url} alt={p.name} width={36} height={36} className="h-full w-full object-cover" />
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
                                {/* Status nonaktif + unggah INLINE -- permintaan
                                    langsung pengguna, 18 September 2026: "product
                                    file tampilkan langsung saja untuk diisi
                                    daripada harus klik manage dulu supaya user
                                    tidak lupa". Sebelumnya tabel ini tidak
                                    menampilkan status aktif/nonaktif sama sekali,
                                    dan satu-satunya jalan unggah file/sampul ada di
                                    modal Kelola -- produk digital yang filenya belum
                                    diunggah diam-diam nonaktif & tidak tampil di
                                    blok Produk. Sekarang tiap baris nonaktif
                                    langsung menampilkan tombol unggah yang kurang
                                    (handler SAMA dgn modal Kelola). */}
                                {!p.is_active && (
                                  <span className="rounded-full border-2 border-[#111111] bg-jeon-coral px-1.5 py-0.5 text-[9px] font-bold text-[#111111]">
                                    {t("dashboard.pages.products.badges.inactive")}
                                  </span>
                                )}
                                {p.product_kind !== "payment_link" && p.product_kind !== "external_link" && !p.has_file && (
                                  <label
                                    className={`flex cursor-pointer items-center gap-1 rounded-full border-2 border-jeon-purple bg-jeon-lavender/40 px-2 py-0.5 text-[9px] font-bold text-jeon-purple hover:bg-jeon-lavender ${
                                      busyId === p.id ? "opacity-60" : ""
                                    }`}
                                  >
                                    <IconUpload className="h-2.5 w-2.5" />
                                    {busyId === p.id ? t("dashboard.pages.products.manageModal.uploading") : t("dashboard.pages.products.badges.uploadFileInline")}
                                    <input
                                      type="file"
                                      className="hidden"
                                      disabled={busyId === p.id}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUpload(p, file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                                {!p.cover_image_url && (
                                  <label
                                    className={`flex cursor-pointer items-center gap-1 rounded-full border-2 border-jeon-purple bg-jeon-lavender/40 px-2 py-0.5 text-[9px] font-bold text-jeon-purple hover:bg-jeon-lavender ${
                                      coverBusyId === p.id ? "opacity-60" : ""
                                    }`}
                                  >
                                    <IconCamera className="h-2.5 w-2.5" />
                                    {coverBusyId === p.id ? t("dashboard.pages.products.manageModal.uploading") : t("dashboard.pages.products.badges.uploadCoverInline")}
                                    <input
                                      type="file"
                                      accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                      className="hidden"
                                      disabled={coverBusyId === p.id}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadCover(p, file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
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
              </>
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
                onCtaClick={() => setAddingProduct(true)}
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
        // highlightLinkId -- susulan 23 September 2026: dulu memakai
        // tokoPreviewSelectId (cuma benar sesaat setelah klik pratinjau,
        // basi begitu blok lain dibuka lewat baris kiri). Sekarang
        // tokoActiveBlockId (dilaporkan BALIK dari BlockSection), jadi
        // sorotan tetap benar apa pun jalur pembukaannya -- baris kiri
        // ATAU pratinjau.
        highlightLinkId={tokoActiveBlockId ?? undefined}
        onSelectLink={setTokoPreviewSelectId}
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
          canManageSplits={canManageSplits}
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
