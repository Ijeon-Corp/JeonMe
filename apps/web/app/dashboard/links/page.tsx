"use client";

import Image from "next/image";

import PageSkeleton from "@/components/Skeleton";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useErrorToast } from "@/lib/use-error-toast";
import {
  ApiError,
  CatalogItem,
  DashboardProduct,
  ExtraPage,
  LinkItem,
  MyPage,
  createBlock,
  createExtraPage,
  createExtraPageBlock,
  createExtraPageLink,
  createLink,
  deleteAudioBlock,
  deleteExtraPage,
  deleteBuilderMediaImage,
  deleteFileBlock,
  deleteGalleryImage,
  deleteLink,
  deleteLinkIcon,
  deleteLinkThumbnail,
  duplicateLink,
  getExtraPage,
  getMyPage,
  listExtraPageLinks,
  listLinks,
  listMyExtraPages,
  listProducts,
  reorderExtraPageLinks,
  reorderLinks,
  updateExtraPage,
  updateLink,
  updateMyPage,
  uploadAudioBlock,
  uploadAvatar,
  uploadBuilderMediaImage,
  uploadExtraPageAvatar,
  uploadFileBlock,
  uploadGalleryImage,
  uploadLinkIcon,
  uploadLinkThumbnail,
  uploadShowcaseImage,
} from "@/lib/api-client";
import { SOCIAL_PLATFORMS, SocialPlatformKey } from "@/lib/social-links";
import { SITE_URL } from "@/lib/site";
import { slugifyTitle } from "@/lib/slug";
import {
  IconCamera,
  IconChevronRight,
  IconColumns,
  IconFileText,
  IconGrid,
  IconGripVertical,
  IconMusicNote,
  IconPencil,
  IconPlus,
  IconStar,
  IconTrash,
  IconX,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import FormField from "@/components/FormField";
import HalamanSayaTabs from "@/components/HalamanSayaTabs";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import BlockToolsStrip from "@/components/dashboard/page/BlockToolsStrip";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";
import { detectLinkIcon } from "@/lib/link-icons";
import { getLibraryIcon } from "@/lib/icon-library";
// blockPreviewFor/isBlockExpandable/stripHtmlToText/maxGalleryImages --
// dipindah ke lib/block-preview.ts (18 September 2026) supaya dipakai
// bersama ProdukPageEditor.tsx (paritas baris blok Toko <-> Links).
import { BLOCK_TILE_CLASS, blockPreviewFor, buildBlockTypeLabel, linkHostname, maxGalleryImages, showsClickCount } from "@/lib/block-preview";
import { normalizeGalleryDisplay } from "@/lib/gallery-display";
import GalleryDisplayPicker from "@/components/dashboard/page/GalleryDisplayPicker";
import LinkDisplayModePicker from "@/components/dashboard/page/LinkDisplayModePicker";
import {
  ChevronDown,
  Clapperboard,
  ClipboardList,
  Code2,
  Columns3,
  FileText as LucideFileText,
  GalleryHorizontal,
  Heading as LucideHeading,
  HelpCircle,
  Image as LucideImage,
  Images as LucideImages,
  LayoutGrid,
  Link as LucideLink,
  Link2,
  List as LucideList,
  MapPin as LucideMapPin,
  MousePointerClick,
  Music as LucideMusic,
  Presentation,
  Rows3,
  SeparatorHorizontal,
  ShoppingBag as LucideShoppingBag,
  Timer,
  TriangleAlert,
  Type as LucideType,
  Video as LucideVideo,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import RichTextEditor from "@/components/dashboard/page/RichTextEditor";
import { ListItemsEditor, toDatetimeLocalValue, type ListEditorItem } from "@/components/dashboard/page/ListItemsEditor";
import { ProdukBlockEditor } from "@/components/dashboard/page/ProdukBlockEditor";
import { isRichTextEmpty } from "@/lib/catalog-blocks";

// LocationPickerModal -- permintaan langsung pengguna, 25 Agustus 2026:
// pop-up peta untuk blok Lokasi. Leaflet butuh `window`/DOM saat mount,
// dimuat client-only lewat next/dynamic (ssr:false) -- pola standar
// Next.js untuk library peta, mencegah error render di server.
const LocationPickerModal = dynamic(() => import("@/components/LocationPickerModal"), { ssr: false });

// IconPickerModal/CatalogBlocksEditor -- keduanya cuma tampil digerbang
// state (modal terbuka / blok katalog sedang diedit), TAPI sebelumnya
// di-static-import sehingga selalu ikut bundle awal halaman ini. Halaman
// ini salah satu yang terberat di dashboard (3600+ baris) dan diduga jadi
// penyebab race hidrasi <Link> vs klik pengguna yang bikin sidebar kadang
// terlihat "refresh"/collapse balik (dilaporkan pengguna 27 Agt 2026) --
// men-dynamic-import keduanya mengecilkan bundle awal, sama seperti
// perbaikan di dashboard/products/page.tsx.
const IconPickerModal = dynamic(() => import("@/components/IconPickerModal"));
const AddLinkModal = dynamic(() => import("@/components/AddLinkModal"));
const BlockDrilldownEditor = dynamic(() => import("@/components/BlockDrilldownEditor"));

// PREMIUM_EXTRA_PAGE_LIMIT -- SAMA PERSIS batas backend (premiumExtraPageLimit,
// page.go) untuk pool Halaman Bio/Landing tambahan (produk punya pool
// terpisah, lihat catatan activePage/extraPages di atas), murni utk UI.
const PREMIUM_EXTRA_PAGE_LIMIT = 5;

// buildWhatsappButtonUrl -- blok "button" mode WhatsApp (permintaan langsung
// pengguna, 14 September 2026: "WA = kanal closing utama kebanyakan
// kreator kita"). Belum ada normalizer nomor telepon di file ini sama
// sekali (baris kontak WhatsApp yang sudah ada, social_whatsapp, dibiarkan
// kreator ketik manual apa adanya) -- konvensi umum wa.me: nomor lokal
// diawali "0" diganti "62" (kode negara Indonesia), selain itu dipakai apa
// adanya setelah karakter non-digit dibuang. `url` hasil fungsi ini
// disimpan APA ADANYA di kolom `url` blok (satu-satunya sumber kebenaran
// tujuan klik, dipakai ulang oleh seluruh mekanisme render/lock/tracking
// yang sudah ada) -- whatsapp_number/whatsapp_message TETAP disimpan
// terpisah di block_data HANYA supaya kreator bisa membuka & mengedit
// nomor/pesannya lagi nanti tanpa perlu mem-parse balik dari URL.
function normalizeWhatsappNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

function buildWhatsappButtonUrl(number: string, message: string): string {
  const normalized = normalizeWhatsappNumber(number);
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${normalized}${query}`;
}

// IconComponent -- diperluas 17 September 2026 (permintaan langsung
// pengguna: "ganti seperti icon icon seperti whatsapp instagram dll bukan
// icon yang dibuat sendiri" -- susulan penolakan ikon hand-drawn baru di
// components/icons.tsx yang sempat ditambahkan sesi ini) supaya bisa
// menerima LucideIcon LANGSUNG, bukan cuma komponen fungsi biasa. Union
// SAMA PERSIS dgn pola yang sudah ada di lib/icon-library.ts (galeri ikon
// pilihan kreator) -- lucide-react memang SUDAH jadi satu-satunya sumber
// ikon "representasi tipe konten ke pengguna" di proyek ini (lihat
// PagePreview.tsx: HelpCircle utk FAQ, dst), components/icons.tsx sengaja
// dibatasi ~44 ikon utk chrome UI dashboard sendiri saja.
export type IconComponent = LucideIcon | ((props: { className?: string }) => React.ReactElement);

// Modal "Tambah" ala Linktree (tangkapan layar pengguna): ganti trigger
// polos jadi galeri pilihan berkategori. Cuma 2 kategori nyata yang bisa
// diisi jujur dari kapabilitas Jeonme -- "Sosial Media" (tautan cepat ke
// platform populer, memakai ulang ikon deteksi platform yang sudah ada di
// link-icons.ts) dan "Konten" (tipe blok yang SUDAH direndang di halaman
// publik utama: link/video/faq/contact_form/maps/text). "Collection" & "Product" ala
// Linktree SENGAJA TIDAK dibuatkan tile -- grup tautan carousel belum ada
// konsepnya, dan Produk sudah punya halaman/tabel sendiri (bukan varian
// baris links), membuat tile untuk keduanya di sini cuma tiruan tanpa fungsi.
export type PlatformQuickAdd = {
  key: string;
  label: string;
  description: string;
  Icon: IconComponent;
  kind: "link" | "video";
  urlTemplate: string;
  badgeClass: string;
};

export type ContentTile = {
  key:
    | "link"
    | "video"
    | "faq"
    | "contact_form"
    | "maps"
    | "text"
    | "accordion"
    | "gallery"
    | "audio"
    | "file"
    | "project_showcase"
    | "catalog"
    // 9 tipe blok "full parity" mode Builder (lihat catatan lengkap di
    // buildBlockTypeLabel).
    | "button"
    | "image"
    | "video_image"
    | "image_slider"
    | "list"
    | "countdown"
    | "produk"
    | "embed_link"
    | "embed";
  label: string;
  description: string;
  Icon: IconComponent;
};

// buildContentTiles -- FUNGSI (bukan konstanta modul) supaya label/
// deskripsinya ikut berganti bahasa, pola sama seperti buildBlockTypeLabel.
function buildContentTiles(t: (key: string) => string): ContentTile[] {
  return [
    { key: "link", label: t("dashboard.pages.links.contentTiles.link.label"), description: t("dashboard.pages.links.contentTiles.link.description"), Icon: LucideLink },
    { key: "video", label: t("dashboard.pages.links.contentTiles.video.label"), description: t("dashboard.pages.links.contentTiles.video.description"), Icon: LucideVideo },
    { key: "faq", label: t("dashboard.pages.links.contentTiles.faq.label"), description: t("dashboard.pages.links.contentTiles.faq.description"), Icon: HelpCircle },
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- SATU judul klik-untuk-
    // buka bebas dari framing tanya-jawab (beda dari FAQ yang daftar Q&A),
    // cocok untuk kebijakan/detail/catatan tambahan apa pun.
    { key: "accordion", label: t("dashboard.pages.links.contentTiles.accordion.label"), description: t("dashboard.pages.links.contentTiles.accordion.description"), Icon: ChevronDown },
    { key: "contact_form", label: t("dashboard.pages.links.contentTiles.contactForm.label"), description: t("dashboard.pages.links.contentTiles.contactForm.description"), Icon: ClipboardList },
    // Permintaan langsung pengguna (referensi tangkapan layar fitur "Maps"
    // Linktree): lokasi Google Maps, bisa ditampilkan tertanam (iframe) atau
    // sebagai tautan langsung -- lihat "Link behavior" di form.
    { key: "maps", label: t("dashboard.pages.links.contentTiles.maps.label"), description: t("dashboard.pages.links.contentTiles.maps.description"), Icon: LucideMapPin },
    // Permintaan langsung pengguna (benchmark Lynk.id -- blok Teks sudah ada
    // di halaman utama mereka sejak awal, Jeonme sebelumnya cuma punya ini di
    // Halaman Tambahan). Paragraf polos, TANPA tautan/aksi -- murni konten
    // (pengumuman, deskripsi singkat, dsb) di antara blok-blok lain.
    { key: "text", label: t("dashboard.pages.links.contentTiles.text.label"), description: t("dashboard.pages.links.contentTiles.text.description"), Icon: LucideType },
    // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
    // 2026 (template portofolio/wisata s.id pakai grid multi-foto, mockup
    // "Music" kompetitor lain pakai pemutar audio tertanam -- keduanya belum
    // ada padanan di Jeonme). Foto/audio diunggah SETELAH blok dibuat (lihat
    // panel "Kelola foto"/"Kelola audio" yang muncul di kartu blok), bukan
    // lewat form pembuatan blok biasa -- beda dari tipe lain yang isinya
    // teks/URL, unggah file butuh multipart terpisah dari JSON create.
    { key: "gallery", label: t("dashboard.pages.links.contentTiles.gallery.label"), description: t("dashboard.pages.links.contentTiles.gallery.description"), Icon: LucideImages },
    { key: "audio", label: t("dashboard.pages.links.contentTiles.audio.label"), description: t("dashboard.pages.links.contentTiles.audio.description"), Icon: LucideMusic },
    // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
    // file pdf download". Pola upload sama seperti gallery/audio di atas
    // (file diunggah SETELAH blok dibuat, lewat panel "Kelola file" yang
    // muncul di kartu blok) -- beda dari produk digital berbayar di Toko,
    // blok ini gratis/lead-magnet (ebook, materi, template), tanpa checkout.
    { key: "file", label: t("dashboard.pages.links.contentTiles.file.label"), description: t("dashboard.pages.links.contentTiles.file.description"), Icon: LucideFileText },
    // "project_showcase" -- permintaan langsung pengguna, 24 Agustus 2026:
    // kartu "Project Unggulan" (contoh tangkapan layar template "Dimas
    // Dev") -- gambar + badge + judul + deskripsi + tombol CTA, cocok utk
    // menonjolkan SATU karya/studi kasus di antara tautan biasa.
    { key: "project_showcase", label: t("dashboard.pages.links.contentTiles.projectShowcase.label"), description: t("dashboard.pages.links.contentTiles.projectShowcase.description"), Icon: Presentation },
    // "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: "ada blok
    // Jenis Rumah ketika di klik akan tampil semua blok dengan isi jenis
    // jenis rumah yang ada" -- blok drill-down 2 tingkat (daftar item ->
    // detail per item, gambar bisa multiple), lihat CatalogTakeoverView
    // (PagePreview.tsx). Klik blok ini di halaman publik GANTI ISI HALAMAN
    // (bukan buka tautan/expand di tempat seperti tipe lain).
    { key: "catalog", label: t("dashboard.pages.links.contentTiles.catalog.label"), description: t("dashboard.pages.links.contentTiles.catalog.description"), Icon: LayoutGrid },
    // 9 tile baru -- "full parity" mode Simple vs Builder (permintaan
    // langsung pengguna 12 September 2026, dikonfirmasi via
    // AskUserQuestion: "Full parity semua tipe blok"). Semua masuk kategori
    // "Lanjutan" (V2_TILE_KEYS.lanjutan, AddLinkModal.tsx) -- tipe yang
    // lebih jarang dipakai kreator awam, sama seperti project_showcase/
    // catalog yang sudah ada di kategori itu.
    { key: "button", label: t("dashboard.pages.links.contentTiles.button.label"), description: t("dashboard.pages.links.contentTiles.button.description"), Icon: MousePointerClick },
    { key: "image", label: t("dashboard.pages.links.contentTiles.image.label"), description: t("dashboard.pages.links.contentTiles.image.description"), Icon: LucideImage },
    { key: "video_image", label: t("dashboard.pages.links.contentTiles.videoImage.label"), description: t("dashboard.pages.links.contentTiles.videoImage.description"), Icon: Clapperboard },
    { key: "image_slider", label: t("dashboard.pages.links.contentTiles.imageSlider.label"), description: t("dashboard.pages.links.contentTiles.imageSlider.description"), Icon: GalleryHorizontal },
    { key: "list", label: t("dashboard.pages.links.contentTiles.list.label"), description: t("dashboard.pages.links.contentTiles.list.description"), Icon: LucideList },
    { key: "countdown", label: t("dashboard.pages.links.contentTiles.countdown.label"), description: t("dashboard.pages.links.contentTiles.countdown.description"), Icon: Timer },
    { key: "produk", label: t("dashboard.pages.links.contentTiles.produk.label"), description: t("dashboard.pages.links.contentTiles.produk.description"), Icon: LucideShoppingBag },
    { key: "embed_link", label: t("dashboard.pages.links.contentTiles.embedLink.label"), description: t("dashboard.pages.links.contentTiles.embedLink.description"), Icon: Link2 },
    { key: "embed", label: t("dashboard.pages.links.contentTiles.embed.label"), description: t("dashboard.pages.links.contentTiles.embed.description"), Icon: Code2 },
  ];
}

// Permintaan langsung pengguna, 14 Agustus 2026: "harusnya semua tipe ini
// [judul bisa diedit, ganti ikon, dst]" -- ikon default per block_type utk
// badge di kartu daftar. Dipisah dari label (buildBlockTypeLabel di atas)
// murni supaya ikonnya TIDAK perlu dihitung ulang tiap render bahasa
// berganti (Icon component-nya konstan, cuma teksnya yang berubah).
// BLOCK_TYPE_ICON -- SEMUA nilai migrasi ke lucide-react 17 September 2026
// (permintaan langsung pengguna: "icon icon seperti whatsapp instagram
// dll bukan icon yang dibuat sendiri", susulan penolakan ikon hand-drawn
// baru di components/icons.tsx). Dipilih menyamai ikon yang SUDAH dipakai
// PagePreview.tsx (halaman publik) di mana sudah ada persis (faq/video/
// gallery/catalog), sisanya padanan lucide yang paling akurat.
const BLOCK_TYPE_ICON: Record<string, IconComponent> = {
  video: LucideVideo,
  faq: HelpCircle,
  accordion: ChevronDown,
  contact_form: ClipboardList,
  maps: LucideMapPin,
  text: LucideType,
  gallery: LucideImages,
  audio: LucideMusic,
  file: LucideFileText,
  project_showcase: Presentation,
  catalog: LayoutGrid,
  // Tipe blok landing (No.99) & Canvas Page Builder (migrasi 000096) --
  // bug dilaporkan pengguna 9 September 2026: blok "button" yang dibuat di
  // Canvas ikut tampil di daftar klasik ini (satu tabel `links` yang sama),
  // tapi tidak ada ikonnya di peta -> `<DefaultIcon/>` dirender dengan
  // komponen undefined -> React error #130, SELURUH halaman /dashboard/
  // links crash (bukan cuma satu baris). Semua tipe yang bisa ada di tabel
  // didaftarkan di sini; pemakaiannya di bawah TETAP punya fallback supaya
  // tipe baru di masa depan tidak pernah bisa menjatuhkan halaman lagi.
  heading: LucideHeading,
  // button/image/video_image/image_slider/list/countdown/embed_link/embed --
  // ikon disamakan dengan BuilderAddComponentModal.tsx (mode Builder) untuk
  // parity visual, bukan lagi placeholder generik defensif (produk BARU
  // ditambahkan di sini -- 8 tipe lain sudah didaftarkan lebih dulu sebagai
  // pencegahan crash, sekarang benar-benar dipakai membuat blok baru juga).
  button: MousePointerClick,
  image: LucideImage,
  section: Rows3,
  column: Columns3,
  divider: SeparatorHorizontal,
  video_image: Clapperboard,
  embed_link: Link2,
  countdown: Timer,
  list: LucideList,
  image_slider: GalleryHorizontal,
  embed: Code2,
  produk: LucideShoppingBag,
};

// FormField -- dipindahkan ke components/FormField.tsx (6 September 2026,
// redesain drill-down Katalog/FAQ, lihat components/BlockDrilldownEditor.tsx)
// supaya dipakai bersama tanpa import silang page<->komponen dynamic-loaded.

// Redesain halaman ini mengikuti PERSIS tangkapan layar halaman "Links"
// Linktree sungguhan yang dikirim pengguna: tombol "+ Add" besar & mencolok
// (bukan trigger teks kecil), tiap kartu tautan punya baris ikon aksi
// (jadwal/kunci/hapus) + jumlah klik NYATA, judul & URL bisa diedit inline
// (ikon pensil), grip drag-handle jadi ikon SVG (bukan karakter unicode).
//
// SENGAJA TIDAK direplikasi: header profil (avatar/bio) di atas -- itu
// SUDAH dikelola di halaman Desain (accordion "Header"), duplikasi di sini
// akan bikin dua sumber kebenaran; tombol "Add collection"/"View archive"
// -- Jeonme belum punya konsep grup tautan (carousel) atau arsip tautan
// terhapus, membuat tombol untuk fitur yang tidak ada bukan tujuan
// permintaan ini.
export default function DashboardLinksPage() {
  const router = useRouter();
  const { t } = useLocale();
  const blockTypeLabel = buildBlockTypeLabel(t);
  const contentTiles = buildContentTiles(t);
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  // catalogSaveQueueRef -- antrean promise PER link, dipakai saveCatalogItems
  // di bawah. Tanpa ini, 2+ PATCH block_data.items beruntun cepat (mis. isi
  // pertanyaan lalu jawaban FAQ tertanam, atau tambah blok lalu langsung isi
  // field-nya) bisa TIBA/diproses server TIDAK berurutan (goroutine Gin
  // konkuren) -- request yang dikirim LEBIH DULU (payload belum lengkap)
  // bisa selesai diproses BELAKANGAN, menimpa balik hasil request berikutnya
  // yang payload-nya lebih lengkap. Antrean ini memaksa network call kedua
  // baru dikirim SETELAH network call pertama (untuk link yang sama) beres,
  // sementara update optimistic UI (setLinks) tetap instan tanpa nunggu.
  const catalogSaveQueueRef = useRef<Record<string, Promise<unknown>>>({});
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Permintaan langsung pengguna, 5 September 2026: pesan error (mis.
  // penolakan moderasi tautan) sebelumnya cuma <p> inline dekat atas
  // halaman -- tidak kelihatan kalau sudah scroll ke form tambah-tautan
  // yang letaknya jauh di bawah. Toast tengah selalu kelihatan berapa pun
  // posisi scroll.
  useErrorToast(error);

  // Modul Halaman Tambahan Fase 2 (permintaan langsung pengguna, 28 Agustus
  // 2026, referensi UI kompetitor "+ Page" + navigation pill): editor Link
  // Bio ini sekarang jadi editor untuk SEMUA halaman bio/landing akun, bukan
  // cuma halaman utama. activePage null = sedang mengedit halaman utama
  // (Home), berisi {id,slug,pageType} = sedang mengedit salah satu halaman
  // tambahan yang dibuat lewat tombol "+ Page" di bawah. Halaman Toko
  // (page_type "produk", termasuk multi-toko Premium) SENGAJA tidak masuk
  // extraPages/pill di sini -- pembuatannya tetap lewat menu Toko (Produk &
  // Monetisasi), keputusan langsung pengguna supaya tidak campur dengan
  // mekanisme pill bio/landing yang baru ini.
  const [activePage, setActivePage] = useState<{ id: string; slug: string; pageType: "bio" | "landing" } | null>(null);
  const [accountUsername, setAccountUsername] = useState("");
  const [extraPages, setExtraPages] = useState<ExtraPage[]>([]);
  const [switchingPage, setSwitchingPage] = useState(false);
  const [creatingPage, setCreatingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  // duplicateFromId -- permintaan langsung pengguna, 28 Agustus 2026: "buat
  // bisa duplikat isi dari page lainnya". "" = halaman kosong (default),
  // "primary" = duplikat Home, id halaman tambahan = duplikat halaman itu.
  const [duplicateFromId, setDuplicateFromId] = useState("");
  const [savingNewPage, setSavingNewPage] = useState(false);
  const [renamingPage, setRenamingPage] = useState(false);
  const [renamePageValue, setRenamePageValue] = useState("");

  // Profil bisa diedit langsung dari sini (permintaan langsung pengguna) --
  // sebelumnya baris ini cuma pratinjau baca-saja, mengedit harus lewat
  // halaman Desain. Nama tampilan & bio disimpan lewat updateMyPage yang
  // sudah ada (satu sumber kebenaran yang SAMA dengan halaman Desain, cuma
  // sekarang ada 2 pintu masuk untuk mengeditnya).
  const [editingProfileField, setEditingProfileField] = useState<"name" | "bio" | null>(null);
  const [profileEditValue, setProfileEditValue] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Kontak sosial (Instagram/TikTok/Facebook/WhatsApp/dll) -- permintaan
  // langsung pengguna, 11 Agustus 2026: panel kolaps di bawah profil, SEMUA
  // platform diedit sekaligus lalu satu tombol Simpan (beda dari nama/bio
  // di atas yang inline per-field) karena 9 field sekaligus tidak masuk
  // akal kalau tiap field simpan sendiri-sendiri begitu blur.
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialDraft, setSocialDraft] = useState<Partial<Record<SocialPlatformKey, string>>>({});
  const [savingSocial, setSavingSocial] = useState(false);

  const [addingLink, setAddingLink] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newURL, setNewURL] = useState("");
  // newDescription -- permintaan langsung pengguna, 24 Agustus 2026: subjudul
  // opsional di bawah judul (kartu ikon+judul+deskripsi+panah, contoh
  // template "Dimas Dev"). Kosong = tetap baris judul tunggal seperti
  // sebelumnya.
  const [newDescription, setNewDescription] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  // Permintaan langsung pengguna: unggah gambar kustom per tautan
  // (menggantikan ikon platform otomatis di halaman publik).
  const [iconUploadingId, setIconUploadingId] = useState<string | null>(null);

  // Modul "Featured Link" (permintaan langsung pengguna, referensi
  // "Featured Layout" Linktree sungguhan): tautan tampil sebagai kartu
  // thumbnail 16:9, lihat catatan lengkap di handleToggleFeatured.
  const [thumbnailUploadingId, setThumbnailUploadingId] = useState<string | null>(null);

  // Blok "gallery"/"audio" (hasil analisa galeri tema kompetitor, 17
  // Agustus 2026): unggah foto/audio langsung dari kartu blok (bukan lewat
  // form pembuatan blok, lihat catatan CONTENT_TILES) -- id blok yang
  // sedang mengunggah, null berarti tidak ada unggahan berjalan.
  const [galleryUploadingId, setGalleryUploadingId] = useState<string | null>(null);
  const [audioUploadingId, setAudioUploadingId] = useState<string | null>(null);
  // Blok "file" (permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download") -- pola sama seperti galleryUploadingId/
  // audioUploadingId di atas.
  const [fileUploadingId, setFileUploadingId] = useState<string | null>(null);

  // Galeri ikon siap-pakai (permintaan langsung pengguna, 13 Agustus 2026:
  // "sediakan banyak icon yang bisa digunakan dan dipilih user") -- id
  // tautan yang sedang membuka IconPickerModal, null berarti modal tertutup.
  const [iconPickerLinkId, setIconPickerLinkId] = useState<string | null>(null);

  // Permintaan langsung pengguna, 14 Agustus 2026: "kalau mau hapus
  // tampilkan toast peringatan dulu" -- id item yang minta dihapus, tampil
  // dulu di dialog peringatan sebelum benar-benar memanggil handleDelete.
  // null berarti dialog tertutup.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal "Tambah" ala Linktree. SATU entry point "Tambah block" (SPEC
  // §10.5, Phase 4) -- kategori modal Populer/Sosial/Konten/Lanjutan.
  // LENGKAP & stabil di production sejak v0.37.0/v0.38.0, flag
  // "page_builder" dihapus dari file ini 8 September 2026.
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<AddCategory>("populer");
  const [addSearch, setAddSearch] = useState("");

  // Edit inline judul/URL langsung di kartu (ikon pensil) -- sebelumnya
  // judul/URL tidak bisa diubah sama sekali setelah dibuat, padahal backend
  // (updateLink) sudah mendukungnya sejak awal.
  const [editingField, setEditingField] = useState<{ id: string; field: "title" | "url" | "description" } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // No.78 (Sprint 9): penjadwalan tautan -- pola sama persis seperti
  // penjadwalan flash sale produk (No.68).
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  // No.79 (Sprint 9): kunci tautan (usia/kode/subscribe). "sensitive" --
  // permintaan langsung pengguna, 20 Agustus 2026: "tambahkan juga
  // sensitive content" -- opsi ke-4, dipakai jalur "Kunci tautan" (khusus
  // block_type "link", form penuh di bawah) MAUPUN toggle ringkas
  // "Tandai konten sensitif" (block_type lain, lihat handleToggleSensitive).
  const [lockEditId, setLockEditId] = useState<string | null>(null);
  const [lockTypeInput, setLockTypeInput] = useState<"age" | "code" | "subscribe" | "sensitive">("code");
  const [lockCodeInput, setLockCodeInput] = useState("");
  const [lockMinAgeInput, setLockMinAgeInput] = useState("18");
  const [savingLock, setSavingLock] = useState(false);

  // No.77 (Sprint 9): blok konten baru (video/formulir kontak/FAQ).
  const [addingBlock, setAddingBlock] = useState(false);
  const [blockType, setBlockType] = useState<
    | "video"
    | "contact_form"
    | "faq"
    | "maps"
    | "text"
    | "accordion"
    | "gallery"
    | "audio"
    | "file"
    | "project_showcase"
    | "catalog"
    // 9 tipe blok "full parity" mode Builder (permintaan langsung pengguna
    // 12 September 2026, dikonfirmasi via AskUserQuestion: "Full parity
    // semua tipe blok"). section/column SENGAJA dilewati -- konsep tree
    // Builder yang tidak cocok struktur list datar mode ini.
    | "button"
    | "image"
    | "video_image"
    | "image_slider"
    | "list"
    | "countdown"
    | "produk"
    | "embed_link"
    | "embed"
  >("video");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockVideoUrl, setBlockVideoUrl] = useState("");
  // Benchmark Lynk.id: blok Teks -- paragraf polos, TANPA tautan/aksi.
  const [blockText, setBlockText] = useState("");
  // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
  // lalu keluar text, bukan hanya untuk faq saja" -- state TERPISAH dari
  // blockText (walau block_data-nya sama-sama {text}) supaya isian tidak
  // ikut kebawa nyasar kalau kreator ganti-ganti pilihan tipe blok di form
  // yang sama sebelum submit.
  const [blockAccordionText, setBlockAccordionText] = useState("");
  const [blockFaqItems, setBlockFaqItems] = useState<{ question: string; answer: string }[]>([
    { question: "", answer: "" },
  ]);
  // Permintaan langsung pengguna: blok "Lokasi" (Maps) -- embed default MATI
  // (radio "Go directly to URL") sampai tautan berhasil diresolusi backend,
  // supaya kreator tidak mengira embed langsung aktif sebelum tersimpan.
  const [blockMapsUrl, setBlockMapsUrl] = useState("");
  const [blockMapsEmbed, setBlockMapsEmbed] = useState(true);
  // mapsPickerOpenFor -- permintaan langsung pengguna, 25 Agustus 2026:
  // "user bisa memilih langsung lokasi dia saat ini lewat blok nya
  // langsung jadi bisa pop up gmaps dan bisa memilih". "add" = form buat
  // blok baru (isi blockMapsUrl), id tautan = form edit blok yang sudah
  // ada (isi editMapsUrl) -- satu modal dipakai ulang utk kedua form,
  // null berarti tertutup.
  const [mapsPickerOpenFor, setMapsPickerOpenFor] = useState<string | null>(null);
  // "project_showcase" -- kartu "Project Unggulan": url = tautan CTA (field
  // generik `blockUrl` di handleCreateBlock, state terpisah supaya tidak
  // nyasar kalau kreator ganti-ganti tipe blok di form yang sama), gambar
  // diunggah SETELAH blok dibuat (pola sama gallery/audio/file, lihat
  // showcaseUploadingId di bawah).
  const [blockShowcaseUrl, setBlockShowcaseUrl] = useState("");
  const [blockShowcaseDescription, setBlockShowcaseDescription] = useState("");
  const [blockShowcaseBadge, setBlockShowcaseBadge] = useState("");
  const [blockShowcaseCta, setBlockShowcaseCta] = useState("");
  const [savingBlock, setSavingBlock] = useState(false);
  const [showcaseUploadingId, setShowcaseUploadingId] = useState<string | null>(null);

  // 9 tipe blok baru "full parity" (12 September 2026) -- state field
  // per-tipe TERPISAH, pola sama persis blockShowcase*/blockVideoUrl di
  // atas (supaya isian tidak nyasar kalau kreator ganti-ganti pilihan tipe
  // blok di form yang sama sebelum submit). image/image_slider/produk
  // TIDAK butuh state di sini -- murni shell-first, isi diatur lewat panel
  // "Kelola X" SETELAH blok dibuat (lihat handleMediaImageUpload/
  // handleGalleryImageUpload/ProdukBlockEditor lebih lanjut di file ini).
  const [blockButtonUrl, setBlockButtonUrl] = useState("");
  const [blockButtonMode, setBlockButtonMode] = useState<"url" | "whatsapp">("url");
  const [blockButtonWhatsappNumber, setBlockButtonWhatsappNumber] = useState("");
  const [blockButtonWhatsappMessage, setBlockButtonWhatsappMessage] = useState("");
  const [blockCountdownTargetAt, setBlockCountdownTargetAt] = useState("");
  const [blockCountdownProductId, setBlockCountdownProductId] = useState("");
  const [blockCountdownCtaLabel, setBlockCountdownCtaLabel] = useState("");
  const [blockCountdownCtaUrl, setBlockCountdownCtaUrl] = useState("");
  const [blockEmbedUrl, setBlockEmbedUrl] = useState("");
  const [blockVideoImageVideoUrl, setBlockVideoImageVideoUrl] = useState("");
  const [blockEmbedLinkUrl, setBlockEmbedLinkUrl] = useState("");
  const [blockEmbedLinkDescription, setBlockEmbedLinkDescription] = useState("");
  // "list" -- style (list/card/testimony) + item array, pola SAMA PERSIS
  // blockFaqItems di atas (shell boleh kosong, validasi backend longgar,
  // beda dari FAQ top-level yang wajib question+answer terisi).
  const [blockListStyle, setBlockListStyle] = useState<"list" | "card" | "testimony">("list");
  const [blockListItems, setBlockListItems] = useState<{ title: string; description: string; author: string; url?: string }[]>([
    { title: "", description: "", author: "" },
  ]);
  // mediaImageUploadingId -- id blok yang gambarnya sedang diunggah lewat
  // panel "Kelola Gambar" bersama (image/video_image/embed_link, SATU
  // endpoint uploadBuilderMediaImage yang sama, lihat catatan lengkap di
  // situ) -- pola sama persis showcaseUploadingId/galleryUploadingId.
  const [mediaImageUploadingId, setMediaImageUploadingId] = useState<string | null>(null);

  // "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: blok
  // drill-down "Jenis Rumah" -> daftar jenis -> detail per jenis, gambar
  // bisa multiple. Item (judul/deskripsi/foto) dikelola lewat
  // BlockDrilldownEditor (§10.5); saveCatalogItems tetap dipakai sebagai
  // titik commit tunggal ke backend.
  const [, setCatalogSavingId] = useState<string | null>(null);

  const [contentEditId, setContentEditId] = useState<string | null>(null);
  // drilldownBlockId -- id blok "catalog"/"faq" yang sedang dibuka lewat
  // BlockDrilldownEditor (redesain 6 September 2026, gaya Linktree: klik
  // blok -> masuk ke dalamnya). `drilldownBlock` LIVE (bukan snapshot) --
  // di-lookup ulang dari `links` tiap render, jadi update optimis dari
  // saveCatalogItems otomatis mengalir ke frame yang sedang terbuka tanpa
  // perlu sinkronisasi manual.
  const [drilldownBlockId, setDrilldownBlockId] = useState<string | null>(null);
  const drilldownBlock = links.find((l) => l.id === drilldownBlockId) ?? null;
  // contentEditingLink -- permintaan langsung pengguna, 19 September 2026
  // ("bukan buka halaman penuh tapi ketika klik blok berganti isi blok nya
  // seperti referensi linktree"): koreksi dari implementasi awal (overlay
  // `fixed inset-0` menutupi SELURUH viewport termasuk kolom Pratinjau
  // Langsung) -- pola yang BENAR ternyata SAMA PERSIS `drilldownBlock` di
  // atas: editor blok menggantikan ISI KOLOM KIRI ("1fr") saja, kolom kanan
  // (LivePreviewPanel, 360px) TETAP terlihat sepanjang waktu. LIVE (bukan
  // snapshot) dengan alasan sama seperti drilldownBlock.
  const contentEditingLink = links.find((l) => l.id === contentEditId) ?? null;
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editMapsUrl, setEditMapsUrl] = useState("");
  const [editMapsEmbed, setEditMapsEmbed] = useState(true);
  const [editText, setEditText] = useState("");
  const [editAccordionText, setEditAccordionText] = useState("");
  // "project_showcase" -- 4 field sekaligus (beda dari tipe blok lain yang
  // cuma butuh 1 textarea/URL), state sendiri-sendiri supaya tidak
  // tercampur dengan editingField (mekanisme edit inline title/url khusus
  // tautan biasa di kartu daftar).
  const [editShowcaseUrl, setEditShowcaseUrl] = useState("");
  const [editShowcaseDescription, setEditShowcaseDescription] = useState("");
  const [editShowcaseBadge, setEditShowcaseBadge] = useState("");
  const [editShowcaseCta, setEditShowcaseCta] = useState("");
  // 9 tipe blok baru "full parity" -- mirror edit-in-place dari state
  // create-form di atas, pola sama persis editVideoUrl/editShowcase*.
  const [editButtonUrl, setEditButtonUrl] = useState("");
  const [editButtonMode, setEditButtonMode] = useState<"url" | "whatsapp">("url");
  const [editButtonWhatsappNumber, setEditButtonWhatsappNumber] = useState("");
  const [editButtonWhatsappMessage, setEditButtonWhatsappMessage] = useState("");
  const [editCountdownTargetAt, setEditCountdownTargetAt] = useState("");
  const [editCountdownProductId, setEditCountdownProductId] = useState("");
  const [editCountdownCtaLabel, setEditCountdownCtaLabel] = useState("");
  const [editCountdownCtaUrl, setEditCountdownCtaUrl] = useState("");
  const [editEmbedUrl, setEditEmbedUrl] = useState("");
  const [editVideoImageVideoUrl, setEditVideoImageVideoUrl] = useState("");
  const [editEmbedLinkUrl, setEditEmbedLinkUrl] = useState("");
  const [editEmbedLinkDescription, setEditEmbedLinkDescription] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts(), listMyExtraPages()])
      .then(([p, l, prod, extras]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
        setAccountUsername(p.username);
        setExtraPages(extras.filter((ep) => ep.page_type !== "produk"));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali saat mount, `t` tidak boleh memicu reload berulang.
  }, []);

  // Wrapper tipis -- mengarahkan mutasi ke endpoint halaman UTAMA atau
  // halaman TAMBAHAN tergantung activePage, supaya seluruh handler di bawah
  // (yang jumlahnya banyak & sudah ada sebelum modul ini) TIDAK perlu
  // masing-masing tahu/bercabang sendiri soal halaman mana yang aktif.
  function currentPagePatch(patch: Parameters<typeof updateMyPage>[0]) {
    return activePage ? updateExtraPage(activePage.id, patch) : updateMyPage(patch);
  }
  function currentUploadAvatar(file: File) {
    return activePage ? uploadExtraPageAvatar(activePage.id, file) : uploadAvatar(file);
  }
  function currentCreateLink(input: { title: string; url: string; description?: string }) {
    return activePage ? createExtraPageLink(activePage.id, input) : createLink(input);
  }
  function currentCreateBlock(input: Parameters<typeof createBlock>[0]) {
    return activePage ? createExtraPageBlock(activePage.id, input) : createBlock(input);
  }
  function currentReorderLinks(items: { id: string; position: number }[]) {
    return activePage ? reorderExtraPageLinks(activePage.id, items) : reorderLinks(items);
  }
  function refreshLinks() {
    return activePage ? listExtraPageLinks(activePage.id) : listLinks();
  }

  // switchToPage -- dipanggil dari pill "Home"/nama halaman tambahan. target
  // null berarti balik ke halaman utama. Men-shim ExtraPageDetail (tidak
  // punya field username sendiri, warisan dari akun) jadi bentuk MyPage
  // seperti pola tokoPreviewPage di dashboard/products/page.tsx, supaya
  // seluruh JSX profil/blok di bawah (baca `page.xxx`) tidak perlu tahu
  // apakah ini halaman utama atau tambahan.
  async function switchToPage(target: { id: string; slug: string; pageType: "bio" | "landing" } | null) {
    if (switchingPage) return;
    setSwitchingPage(true);
    setError(null);
    try {
      if (target === null) {
        const [p, l] = await Promise.all([getMyPage(), listLinks()]);
        setActivePage(null);
        setPage(p);
        setLinks(l);
      } else {
        const [detail, l] = await Promise.all([getExtraPage(target.id), listExtraPageLinks(target.id)]);
        setActivePage(target);
        setPage({
          ...detail,
          username: accountUsername,
          verification: { email_verified: false, profile_complete: false, has_paid_order: false, is_verified: false },
        });
        setLinks(l);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.loadPageFailed"));
    } finally {
      setSwitchingPage(false);
    }
  }

  async function handleCreatePage(e: React.FormEvent) {
    e.preventDefault();
    const title = newPageTitle.trim();
    if (!title || savingNewPage) return;
    setSavingNewPage(true);
    setError(null);
    const baseSlug = slugifyTitle(title);
    let slug = baseSlug;
    // resolvedPageType -- kalau menduplikat, halaman baru mewarisi page_type
    // SUMBER (backend juga menegakkan ini, lihat CreatePage) -- Home selalu
    // "bio", halaman tambahan lain ambil dari extraPages yang sudah dimuat
    // (tidak perlu fetch tambahan, produk sudah difilter keluar dari list
    // ini sejak awal jadi tidak pernah muncul sebagai pilihan sumber).
    const resolvedPageType: "bio" | "landing" =
      duplicateFromId && duplicateFromId !== "primary" && extraPages.find((ep) => ep.id === duplicateFromId)?.page_type === "landing"
        ? "landing"
        : "bio";
    try {
      let created: { id: string; message: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          created = await createExtraPage({ name: title, slug, page_type: "bio", duplicate_from: duplicateFromId || undefined });
          break;
        } catch (err) {
          const isSlugTaken = err instanceof ApiError && err.status === 409;
          if (!isSlugTaken || attempt === 4) throw err;
          slug = `${baseSlug}-${Math.floor(1000 + attempt * 137 + title.length * 7).toString(36)}`;
        }
      }
      if (!created) return;
      const freshExtras = await listMyExtraPages();
      setExtraPages(freshExtras.filter((ep) => ep.page_type !== "produk"));
      setNewPageTitle("");
      setDuplicateFromId("");
      setCreatingPage(false);
      await switchToPage({ id: created.id, slug, pageType: resolvedPageType });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.createPageFailed"));
    } finally {
      setSavingNewPage(false);
    }
  }

  async function handleTogglePagePublish(target: ExtraPage) {
    const next = !target.is_published;
    setExtraPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, is_published: next } : p)));
    if (activePage?.id === target.id) setPage((prev) => (prev ? { ...prev, is_published: next } : prev));
    try {
      await updateExtraPage(target.id, { is_published: next });
    } catch (err) {
      setExtraPages((prev) => prev.map((p) => (p.id === target.id ? { ...p, is_published: !next } : p)));
      if (activePage?.id === target.id) setPage((prev) => (prev ? { ...prev, is_published: !next } : prev));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.togglePagePublishFailed"));
    }
  }

  async function handleDeletePage(target: ExtraPage) {
    const ok = await confirmDelete(t("dashboard.pages.links.deletePageConfirm.text").replace("{name}", target.name), {
      confirmButtonText: t("dashboard.pages.links.deletePageConfirm.confirmButton"),
    });
    if (!ok) return;
    const previous = extraPages;
    setExtraPages((prev) => prev.filter((p) => p.id !== target.id));
    try {
      await deleteExtraPage(target.id);
      if (activePage?.id === target.id) await switchToPage(null);
    } catch (err) {
      setExtraPages(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deletePageFailed"));
    }
  }

  function startRenamePage(current: ExtraPage) {
    setRenamePageValue(current.name);
    setRenamingPage(true);
  }

  async function saveRenamePage() {
    if (!activePage) return;
    const name = renamePageValue.trim();
    setRenamingPage(false);
    if (!name) return;
    const previous = extraPages;
    setExtraPages((prev) => prev.map((p) => (p.id === activePage.id ? { ...p, name } : p)));
    try {
      await updateExtraPage(activePage.id, { name });
    } catch (err) {
      setExtraPages(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.renamePageFailed"));
    }
  }

  // handleToggleShowProfileHeader -- permintaan langsung pengguna, 28
  // Agustus 2026: "biasanya page baru untuk landing page biasanya bisa
  // juga tidak menampilkan foto profile nama dsb gitu" -- KHUSUS halaman
  // tambahan (activePage truthy, dijamin oleh satu-satunya tempat tombol
  // ini dirender). Panggil updateExtraPage LANGSUNG (bukan lewat
  // currentPagePatch) -- field ini sengaja TIDAK ada di updateMyPage,
  // halaman utama tidak bisa menyembunyikan identitasnya sendiri.
  async function handleToggleShowProfileHeader() {
    if (!activePage || !page) return;
    const next = !(page.show_profile_header ?? true);
    const previous = page;
    setPage({ ...page, show_profile_header: next });
    try {
      await updateExtraPage(activePage.id, { show_profile_header: next });
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.toggleProfileHeaderFailed"));
    }
  }

  function startEditProfileField(field: "name" | "bio") {
    if (!page) return;
    setEditingProfileField(field);
    setProfileEditValue(field === "name" ? page.display_name : page.bio);
  }

  async function saveEditProfileField() {
    if (!page || !editingProfileField) return;
    const field = editingProfileField;
    const value = profileEditValue.trim();
    setEditingProfileField(null);

    const previous = page;
    const patch = field === "name" ? { display_name: value } : { bio: value };
    setPage({ ...page, ...patch });
    try {
      await currentPagePatch(patch);
    } catch (err) {
      setPage(previous);
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.pages.links.errors.saveProfileFieldFailed").replace(
              "{field}",
              field === "name" ? t("dashboard.pages.links.profile.displayNameLabel") : t("dashboard.pages.links.profile.bioLabel")
            )
      );
    }
  }

  function openSocialPanel() {
    if (!page) return;
    setSocialDraft({
      instagram: page.social_instagram,
      tiktok: page.social_tiktok,
      facebook: page.social_facebook,
      whatsapp: page.social_whatsapp,
      youtube: page.social_youtube,
      x: page.social_x,
      linkedin: page.social_linkedin,
      telegram: page.social_telegram,
      email: page.social_email,
      github: page.social_github,
      website: page.social_website,
    });
    setSocialOpen(true);
  }

  async function saveSocial() {
    if (!page) return;
    setSavingSocial(true);
    const patch = {
      social_instagram: (socialDraft.instagram ?? "").trim(),
      social_tiktok: (socialDraft.tiktok ?? "").trim(),
      social_facebook: (socialDraft.facebook ?? "").trim(),
      social_whatsapp: (socialDraft.whatsapp ?? "").trim(),
      social_youtube: (socialDraft.youtube ?? "").trim(),
      social_x: (socialDraft.x ?? "").trim(),
      social_linkedin: (socialDraft.linkedin ?? "").trim(),
      social_telegram: (socialDraft.telegram ?? "").trim(),
      social_email: (socialDraft.email ?? "").trim(),
      social_github: (socialDraft.github ?? "").trim(),
      social_website: (socialDraft.website ?? "").trim(),
    };
    try {
      await currentPagePatch(patch);
      setPage({ ...page, ...patch });
      setSocialOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveSocialFailed"));
    } finally {
      setSavingSocial(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !page) return;

    setAvatarUploading(true);
    try {
      const { avatar_url } = await currentUploadAvatar(file);
      setPage({ ...page, avatar_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadAvatarFailed"));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newURL.trim()) return;
    // setError(null) SEBELUM percobaan -- ditemukan pengguna 5 September
    // 2026: tanpa ini, percobaan KEDUA yang gagal dgn pesan error PERSIS
    // SAMA (mis. tautan yang sama masih diblokir moderasi) tidak pernah
    // memicu toast lagi -- React membatalkan re-render kalau setState
    // dipanggil dgn nilai yang Object.is-sama dgn state saat ini, jadi
    // useErrorToast (bergantung pada [message] berubah) tidak pernah
    // jalan ulang. Reset ke null dulu memaksa transisi nilai yang
    // sungguhan terjadi, pola yang sama sudah dipakai handler lain di
    // file ini (mis. handleToggleActive).
    setError(null);
    try {
      const created = await currentCreateLink({ title: newTitle, url: newURL, description: newDescription.trim() });
      setLinks((prev) => [...prev, created]);
      setNewTitle("");
      setNewURL("");
      setNewDescription("");
      setAddingLink(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.createLinkFailed"));
    }
  }

  // Dipanggil dari modal "Tambah" -- membuka form tautan biasa yang sudah
  // ada (addingLink), dengan judul/URL PRAISI dari tile "Tautan" (kosong)
  // atau baris platform Sosial Media (judul platform + contoh URL siap
  // dilengkapi, mis. "https://wa.me/62").
  function openLinkFormPrefilled(title: string, url: string) {
    setNewTitle(title);
    setNewURL(url);
    setNewDescription("");
    setAddingLink(true);
    setAddModalOpen(false);
  }

  // Dipanggil untuk tile "Video" & baris Suggested YouTube/TikTok -- BEDA
  // dari tautan biasa, disimpan sebagai block_type "video" supaya halaman
  // publik merender embed video asli (VideoEmbedBlock), bukan cuma tautan
  // teks -- inilah yang bikin pilihan platform ini "fungsional" sungguhan,
  // bukan cuma ikon dekoratif.
  function openVideoFormPrefilled(title: string) {
    setBlockType("video");
    setBlockTitle(title);
    setBlockVideoUrl("");
    setAddingBlock(true);
    setAddModalOpen(false);
  }

  function openBlockFormPrefilled(
    type:
      | "faq"
      | "contact_form"
      | "text"
      | "accordion"
      | "gallery"
      | "audio"
      | "file"
      | "project_showcase"
      | "catalog"
      | "button"
      | "image"
      | "video_image"
      | "image_slider"
      | "list"
      | "countdown"
      | "produk"
      | "embed_link"
      | "embed",
    title: string
  ) {
    setBlockType(type);
    setBlockTitle(title);
    if (type === "text") setBlockText("");
    if (type === "accordion") setBlockAccordionText("");
    if (type === "project_showcase") {
      setBlockShowcaseUrl("");
      setBlockShowcaseDescription("");
      setBlockShowcaseBadge("");
      setBlockShowcaseCta("");
    }
    if (type === "button") {
      setBlockButtonUrl("");
      setBlockButtonMode("url");
      setBlockButtonWhatsappNumber("");
      setBlockButtonWhatsappMessage("");
    }
    if (type === "countdown") {
      setBlockCountdownTargetAt("");
      setBlockCountdownProductId("");
      setBlockCountdownCtaLabel("");
      setBlockCountdownCtaUrl("");
    }
    if (type === "embed") setBlockEmbedUrl("");
    if (type === "video_image") setBlockVideoImageVideoUrl("");
    if (type === "embed_link") {
      setBlockEmbedLinkUrl("");
      setBlockEmbedLinkDescription("");
    }
    if (type === "list") {
      setBlockListStyle("list");
      setBlockListItems([{ title: "", description: "", author: "" }]);
    }
    setAddingBlock(true);
    setAddModalOpen(false);
  }

  // openMapsFormPrefilled -- tile "Lokasi" (permintaan langsung pengguna).
  function openMapsFormPrefilled() {
    setBlockType("maps");
    setBlockTitle(t("dashboard.pages.links.defaultMapsTitle"));
    setBlockMapsUrl("");
    setBlockMapsEmbed(true);
    setAddingBlock(true);
    setAddModalOpen(false);
  }

  function handleSelectPlatform(platform: PlatformQuickAdd) {
    if (platform.kind === "video") {
      openVideoFormPrefilled(t("dashboard.pages.links.videoTitleTemplate").replace("{platform}", platform.label));
    } else {
      openLinkFormPrefilled(platform.label, platform.urlTemplate);
    }
  }

  function handleSelectContentTile(tile: ContentTile) {
    if (tile.key === "link") openLinkFormPrefilled("", "");
    else if (tile.key === "video") openVideoFormPrefilled("");
    else if (tile.key === "maps") openMapsFormPrefilled();
    // judul blok baru dikosongkan (bukan lagi label tipe generik) --
    // permintaan langsung pengguna, 19 September 2026 ("judul blok juga
    // itu optional untuk bisa ditampilkan seperti contoh nya kedua blok
    // ini" -- referensi blok "video", yang SUDAH mulai kosong lewat
    // openVideoFormPrefilled("") di atas). Pola & pengecualian SAMA PERSIS
    // fix serupa utk blok bersarang (BlockDrilldownEditor.tsx, 15
    // September 2026): "catalog" TETAP diberi label -- baris blok katalog
    // baru butuh identitas awal yg jelas di daftar, tipe lain semuanya
    // boleh mulai tanpa judul (halaman publik SEKARANG menyembunyikannya
    // total kalau kosong, baris dashboard tetap jatuh balik ke nama tipe).
    else openBlockFormPrefilled(tile.key, tile.key === "catalog" ? tile.label : "");
  }

  async function handleToggleActive(link: LinkItem) {
    const nextActive = !link.is_active;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: nextActive } : l)));
    try {
      await updateLink(link.id, { is_active: nextActive });
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_active: link.is_active } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.updateLinkFailed"));
    }
  }

  async function handleDelete(id: string) {
    const previous = links;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteLinkFailed"));
    }
  }

  // handleIconUpload/handleRemoveIcon -- permintaan langsung pengguna:
  // unggah gambar kustom per tautan, menggantikan ikon platform otomatis
  // di halaman publik.
  async function handleIconUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIconUploadingId(link.id);
    setError(null);
    try {
      const { custom_icon_url } = await uploadLinkIcon(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, custom_icon_url } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadIconFailed"));
    } finally {
      setIconUploadingId(null);
    }
  }

  // handleRemoveIcon -- menghapus KEDUANYA sekaligus (custom_icon_url
  // upload MAUPUN icon_key galeri) supaya "Hapus" selalu benar-benar
  // kembali ke deteksi otomatis, bukan diam-diam menyingkap salah satu
  // yang tadinya tertutup oleh yang lain (custom_icon_url menang lebih
  // dulu dari icon_key, lihat prioritas render di PagePreview.tsx) --
  // kalau cuma satu yang dihapus, kreator akan bingung melihat ikon lain
  // muncul tiba-tiba padahal baru saja menekan "Hapus".
  async function handleRemoveIcon(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, custom_icon_url: "", icon_key: "" } : l)));
    try {
      await Promise.all([deleteLinkIcon(link.id), updateLink(link.id, { icon_key: "" })]);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteIconFailed"));
    }
  }

  // handleIconColorChange/handleClearIconColor -- permintaan langsung
  // pengguna, 22 Agustus 2026: "bisa mengubah warna yang kita inginkan
  // untuk icon di blok daripada hanya warna hitam saja". TERPISAH dari
  // handleRemoveIcon di atas -- warna ini aditif (berlaku BARENGAN dengan
  // ikon galeri ATAU deteksi otomatis, bukan gantinya), jadi butuh
  // mekanisme hapus sendiri, tidak ikut tercampur dgn "Hapus ikon".
  async function handleIconColorChange(link: LinkItem, color: string) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_color: color } : l)));
    try {
      await updateLink(link.id, { icon_color: color });
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.changeIconColorFailed"));
    }
  }

  async function handleClearIconColor(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_color: "" } : l)));
    try {
      await updateLink(link.id, { icon_color: "" });
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.resetIconColorFailed"));
    }
  }

  // handleGalleryImageUpload/handleGalleryImageDelete -- blok "gallery"
  // (hasil analisa galeri tema kompetitor, 17 Agustus 2026): SATU foto per
  // panggilan, backend mengembalikan array `images` TERBARU (bukan cuma
  // URL foto baru) supaya state links tinggal ditimpa langsung, tidak
  // perlu digabung manual dengan array lama di sisi klien.
  async function handleGalleryImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setGalleryUploadingId(link.id);
    setError(null);
    try {
      const { images } = await uploadGalleryImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadGalleryPhotoFailed"));
    } finally {
      setGalleryUploadingId(null);
    }
  }

  async function handleGalleryImageDelete(link: LinkItem, index: number) {
    setError(null);
    try {
      const { images } = await deleteGalleryImage(link.id, index);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, images } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteGalleryPhotoFailed"));
    }
  }

  // handleShowcaseImageUpload -- blok "project_showcase", pola sama seperti
  // handleThumbnailUpload (satu gambar, unggah ulang menimpa) -- BEDA cuma
  // disimpan di block_data.image_url (lihat UploadShowcaseImage, links.go).
  async function handleShowcaseImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setShowcaseUploadingId(link.id);
    setError(null);
    try {
      const { image_url } = await uploadShowcaseImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadImageFailed"));
    } finally {
      setShowcaseUploadingId(null);
    }
  }

  // handleMediaImageUpload/Delete -- panel "Kelola Gambar" bersama blok
  // "image"/"video_image"/"embed_link" ("full parity" mode Builder, 12
  // September 2026) -- SATU endpoint uploadBuilderMediaImage/
  // deleteBuilderMediaImage dipakai bersama ketiganya (mediaImageBlockTypes,
  // links.go), pola sama persis handleShowcaseImageUpload di atas (satu
  // gambar, unggah ulang menimpa) tapi tanpa `path` (selalu root di mode
  // Simple, tidak ada konsep bersarang Section/Column di sini).
  async function handleMediaImageUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMediaImageUploadingId(link.id);
    setError(null);
    try {
      const { image_url } = await uploadBuilderMediaImage(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadImageFailed"));
    } finally {
      setMediaImageUploadingId(null);
    }
  }

  async function handleMediaImageDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteBuilderMediaImage(link.id);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, image_url: "" } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteImageFailed"));
    }
  }

  // handleBlockDataPatch -- panel "Kelola Item" (blok "list") & "Kelola
  // Produk" (blok "produk"), keduanya PATCH generik ke updateLink (bukan
  // endpoint upload multipart khusus) -- ...link.block_data WAJIB
  // di-spread dulu (links.go's Update MENGGANTI block_data utuh, bukan
  // merge, lihat catatan lengkap di handleSaveContent) supaya field
  // sebelah yang tidak disentuh panel ini (mis. `layout` saat cuma
  // product_ids yang berubah) tidak ikut hilang.
  async function handleBlockDataPatch(link: LinkItem, patch: Record<string, unknown>) {
    setError(null);
    const nextBlockData = { ...link.block_data, ...patch };
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: nextBlockData } : l)));
    try {
      await updateLink(link.id, { block_data: nextBlockData });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
    }
  }

  // handleListItemsPatch -- panel "Kelola Item" (blok "list"), varian
  // DEBOUNCE dari handleBlockDataPatch di atas KHUSUS untuk `items[]` --
  // ListItemsEditor's onUpdateItems terpanggil PER KETUKAN untuk field
  // deskripsi (RichTextEditor.onChange, lihat catatan lengkap "AMAN
  // dipanggil sesering itu" di komponen itu -- SENGAJA aman karena rute
  // Builder cuma menulis draft lokal, TIDAK memanggil API tiap ketukan).
  // Mode Simple TIDAK punya draft -- tanpa debounce ini, PATCH generik
  // (bukan endpoint upload khusus) akan terkirim ke server SETIAP ketukan
  // saat mengetik deskripsi item. State lokal (`links`) tetap diperbarui
  // LANGSUNG (optimis, supaya RichTextEditor yang terkontrol tetap
  // responsif) -- cuma panggilan API-nya yang ditunda.
  const listItemsSaveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  function handleListItemsPatch(link: LinkItem, items: ListEditorItem[]) {
    setError(null);
    const nextBlockData = { ...link.block_data, items };
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: nextBlockData } : l)));
    const existing = listItemsSaveTimers.current.get(link.id);
    if (existing) clearTimeout(existing);
    listItemsSaveTimers.current.set(
      link.id,
      setTimeout(() => {
        listItemsSaveTimers.current.delete(link.id);
        updateLink(link.id, { block_data: nextBlockData }).catch((err) => {
          setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
        });
      }, 700)
    );
  }

  // ---------- "catalog" -- panel "Kelola Katalog" ----------
  // Semua fungsi di bawah PATCH block_data.items UTUH (pola sama FAQ --
  // array lengkap dikirim ulang tiap perubahan, TIDAK ada endpoint CRUD
  // item terpisah di backend). Upload/hapus foto per-item DIHAPUS 15
  // September 2026 (permintaan langsung pengguna: layar item katalog tidak
  // lagi punya field title/description/photo manual sama sekali, lihat
  // catatan lengkap di BlockDrilldownEditor.tsx's CatalogItemFrame) --
  // uploadCatalogItemImage/deleteCatalogItemImage (lib/api-client.ts) &
  // endpoint backend-nya TETAP ada (item lama yang sudah punya foto masih
  // tampil apa adanya di halaman publik), cuma UI unggah baru yang hilang.

  async function saveCatalogItems(link: LinkItem, items: CatalogItem[]) {
    setCatalogSavingId(link.id);
    setError(null);
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, items } } : l)));
    // Antrean PER link -- PATCH kedua baru dikirim SETELAH PATCH pertama
    // (link yang sama) beres, supaya urutan tulis di backend sama dengan
    // urutan sebenarnya di client (goroutine Gin konkuren bisa saja
    // MEMPROSES 2 request yang tiba hampir bersamaan tidak berurutan kalau
    // dikirim paralel -- payload lebih lama yang selesai belakangan bisa
    // menimpa balik payload lebih baru).
    const queuedBefore = catalogSaveQueueRef.current[link.id] ?? Promise.resolve();
    const thisSave = queuedBefore.catch(() => {}).then(() => updateLink(link.id, { block_data: { items } }));
    catalogSaveQueueRef.current[link.id] = thisSave.catch(() => {});
    try {
      await thisSave;
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveCatalogItemFailed"));
    } finally {
      setCatalogSavingId(null);
    }
  }

  // handleSaveFaqItems -- blok FAQ TINGKAT ATAS (bukan tertanam di dalam
  // katalog), dipakai tombol Simpan eksplisit BlockDrilldownEditor. BEDA
  // sengaja dari handleSaveContent (panel FAQ inline lama): update optimis
  // lokal seperti saveCatalogItems, BUKAN refreshLinks() reload penuh --
  // supaya frame yang sedang terbuka tidak "berkedip" balik ke data lama
  // sebelum server selesai merespons. Tombol Simpan eksplisit (bukan
  // autosave onBlur) WAJIB di sini -- lihat komentar panjang di
  // BlockDrilldownEditor.tsx soal validateBlockDataAtDepth di backend yang
  // mewajibkan question+answer lengkap persis di depth==1.
  async function handleSaveFaqItems(link: LinkItem, items: { question: string; answer: string }[]): Promise<boolean> {
    setError(null);
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, items } } : l)));
    try {
      await updateLink(link.id, { block_data: { items } });
      return true;
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
      return false;
    }
  }


  // handleAudioUpload/handleAudioDelete -- blok "audio", pola sama seperti
  // handleIconUpload (unggah ulang menimpa file yang sama, satu audio per
  // blok). Cover art blok ini sengaja TIDAK dapat unggahan sendiri --
  // dipakai ulang tombol ikon kustom yang sudah generik untuk semua
  // block_type (lihat baris kontrol ikon di kartu blok).
  async function handleAudioUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setAudioUploadingId(link.id);
    setError(null);
    try {
      const { audio_url, title } = await uploadAudioBlock(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, title, block_data: { ...l.block_data, audio_url } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadAudioFailed"));
    } finally {
      setAudioUploadingId(null);
    }
  }

  async function handleAudioDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteAudioBlock(link.id);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, audio_url: "" } } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteAudioFailed"));
    }
  }

  // handleFileUpload/handleFileDelete -- blok "file" (permintaan langsung
  // pengguna, 20 Agustus 2026: "tambahkan file pdf download"), pola sama
  // seperti handleAudioUpload/handleAudioDelete di atas -- beda utama:
  // title blok TIDAK ditimpa (lihat catatan UploadFile, links.go), cuma
  // file_url/file_name/file_size_bytes yang diperbarui.
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setFileUploadingId(link.id);
    setError(null);
    try {
      const { file_url, file_name, file_size_bytes } = await uploadFileBlock(link.id, file);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, file_url, file_name, file_size_bytes } } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadFileFailed"));
    } finally {
      setFileUploadingId(null);
    }
  }

  async function handleFileDelete(link: LinkItem) {
    setError(null);
    try {
      await deleteFileBlock(link.id);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, block_data: { ...l.block_data, file_url: "", file_name: "", file_size_bytes: 0 } } : l))
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteFileFailed"));
    }
  }

  // handleSelectLibraryIcon -- juga menghapus custom_icon_url yang mungkin
  // sudah ada (kalau tidak, ikon yang baru dipilih tidak akan pernah
  // terlihat -- custom_icon_url selalu menang lebih dulu di prioritas
  // render, lihat PagePreview.tsx) supaya ikon yang baru saja dipilih
  // langsung terlihat.
  async function handleSelectLibraryIcon(link: LinkItem, key: string) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, icon_key: key, custom_icon_url: "" } : l)));
    setIconPickerLinkId(null);
    try {
      await updateLink(link.id, { icon_key: key });
      if (link.custom_icon_url) {
        await deleteLinkIcon(link.id);
      }
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.selectIconFailed"));
    }
  }

  // handleToggleFeatured -- Modul "Featured Link" (permintaan langsung
  // pengguna, referensi "Featured Layout" Linktree sungguhan): tandai
  // tautan tampil sebagai kartu thumbnail 16:9. listLinks() dipanggil
  // ULANG setelah sukses (bukan cuma optimistic update biasa) -- backend
  // bisa MENURUNKAN thumbnail otomatis dari URL YouTube saat ini juga
  // (lihat deriveYoutubeThumbnail, links.go), respons PATCH sendiri cuma
  // {message}, jadi satu-satunya cara melihat hasilnya tanpa reload
  // manual adalah memuat ulang daftar.
  async function handleToggleFeatured(link: LinkItem) {
    const nextFeatured = !link.is_featured;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_featured: nextFeatured } : l)));
    try {
      await updateLink(link.id, { is_featured: nextFeatured });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
    } catch (err) {
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, is_featured: link.is_featured } : l)));
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.updateLinkFailed"));
    }
  }

  async function handleThumbnailUpload(e: React.ChangeEvent<HTMLInputElement>, link: LinkItem) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setThumbnailUploadingId(link.id);
    setError(null);
    try {
      const { thumbnail_url } = await uploadLinkThumbnail(link.id, file);
      setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, thumbnail_url, is_featured: true } : l)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadThumbnailFailed"));
    } finally {
      setThumbnailUploadingId(null);
    }
  }

  // handleRemoveThumbnail -- ikut mematikan is_featured (kartu Featured
  // tanpa thumbnail tidak masuk akal, lihat renderLinkOrBlock di
  // PagePreview.tsx) -- mengembalikan tautan ke baris klasik, bukan
  // cuma menghapus gambarnya sambil status Featured tetap menyala.
  async function handleRemoveThumbnail(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, thumbnail_url: "", is_featured: false } : l)));
    try {
      await deleteLinkThumbnail(link.id);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deleteThumbnailFailed"));
    }
  }

  function startEditField(link: LinkItem, field: "title" | "url" | "description") {
    setEditingField({ id: link.id, field });
    setEditingValue(field === "title" ? link.title : field === "url" ? link.url : link.description);
  }

  async function saveEditField(link: LinkItem) {
    if (!editingField || editingField.id !== link.id) return;
    const field = editingField.field;
    const value = editingValue.trim();
    setEditingField(null);
    const currentValue = field === "title" ? link.title : field === "url" ? link.url : link.description;
    // description -- permintaan langsung pengguna, 24 Agustus 2026: BEDA
    // dari title/url (wajib diisi, string kosong dibatalkan), string
    // kosong di sini SAH (mengosongkan deskripsi, kembali ke baris judul
    // tunggal seperti sebelumnya).
    // url pada blok "image" -- susulan 14 September 2026 (link tujuan
    // opsional, beda dari blok "link" yang url-nya wajib): boleh
    // dikosongkan lagi (kembali ke foto tidak bisa diklik), TIDAK seperti
    // "link" yang menolak string kosong (URL-nya inti blok itu sendiri).
    const urlOptionalForThisBlock = field === "url" && link.block_type === "image";
    if (field !== "description" && !urlOptionalForThisBlock && !value) return;
    if (value === currentValue) return;

    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, [field]: value } : l)));
    try {
      await updateLink(link.id, field === "title" ? { title: value } : field === "url" ? { url: value } : { description: value });
    } catch (err) {
      setLinks(previous);
      setError(
        err instanceof ApiError
          ? err.message
          : t("dashboard.pages.links.errors.updateFieldFailed").replace(
              "{field}",
              field === "title"
                ? t("dashboard.pages.links.fieldNames.title")
                : field === "url"
                ? t("dashboard.pages.links.fieldNames.url")
                : t("dashboard.pages.links.fieldNames.description")
            )
      );
    }
  }

  function openScheduleForm(link: LinkItem) {
    setScheduleEditId(link.id);
    setScheduleStart(link.starts_at ? link.starts_at.slice(0, 16) : "");
    setScheduleEnd(link.ends_at ? link.ends_at.slice(0, 16) : "");
  }

  async function handleSaveSchedule(link: LinkItem) {
    if (!scheduleStart || !scheduleEnd) {
      setError(t("dashboard.pages.links.errors.scheduleRequired"));
      return;
    }
    const startsAt = new Date(scheduleStart).toISOString();
    const endsAt = new Date(scheduleEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError(t("dashboard.pages.links.errors.scheduleEndAfterStart"));
      return;
    }
    setError(null);
    setSavingSchedule(true);
    try {
      await updateLink(link.id, { starts_at: startsAt, ends_at: endsAt });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
      setScheduleEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.scheduleFailed"));
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleClearSchedule(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_schedule: true });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.cancelScheduleFailed"));
    }
  }

  function openLockForm(link: LinkItem) {
    setLockEditId(link.id);
    setLockTypeInput(link.lock_type || "code");
    setLockCodeInput(link.lock_code || "");
    setLockMinAgeInput(link.lock_min_age ? String(link.lock_min_age) : "18");
  }

  async function handleSaveLock(link: LinkItem) {
    if (lockTypeInput === "code" && !lockCodeInput.trim()) {
      setError(t("dashboard.pages.links.errors.lockCodeRequired"));
      return;
    }
    if (lockTypeInput === "age" && (!lockMinAgeInput || Number(lockMinAgeInput) < 13)) {
      setError(t("dashboard.pages.links.errors.lockMinAge"));
      return;
    }
    setError(null);
    setSavingLock(true);
    try {
      await updateLink(link.id, {
        lock_type: lockTypeInput,
        lock_code: lockTypeInput === "code" ? lockCodeInput.trim() : undefined,
        lock_min_age: lockTypeInput === "age" ? Number(lockMinAgeInput) : undefined,
      });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
      setLockEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.lockLinkFailed"));
    } finally {
      setSavingLock(false);
    }
  }

  async function handleClearLock(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_lock: true });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.unlockLinkFailed"));
    }
  }

  // handleToggleSensitive -- permintaan langsung pengguna, 20 Agustus 2026:
  // "tambahkan juga sensitive content" -- versi RINGKAS dari form kunci di
  // atas, khusus block_type SELAIN "link" (video/faq/maps/gallery/audio/
  // accordion/text/contact_form). Tipe-tipe ini tidak punya age/kode/
  // subscribe (tidak masuk akal untuk konten inline, bukan tautan keluar),
  // jadi cukup satu klik toggle -- bukan form seperti openLockForm/
  // handleSaveLock yang menawarkan 4 pilihan sekaligus.
  async function handleToggleSensitive(link: LinkItem) {
    setError(null);
    try {
      if (link.lock_type === "sensitive") {
        await updateLink(link.id, { clear_lock: true });
      } else {
        await updateLink(link.id, { lock_type: "sensitive" });
      }
      const refreshed = await refreshLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.markSensitiveFailed"));
    }
  }

  // handleDuplicate -- permintaan langsung pengguna, 20 Agustus 2026: "di
  // bagian link bio di blok nya tambahkan fungsi duplicate". Berlaku utk
  // SEMUA block_type -- backend (LinksHandler.Duplicate) menyalin seluruh
  // kolom sekaligus, frontend cukup refresh list setelahnya (pola sama
  // seperti handleSaveLock/handleClearLock di atas).
  async function handleDuplicate(link: LinkItem) {
    setError(null);
    try {
      await duplicateLink(link.id);
      const refreshed = await refreshLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.duplicateFailed"));
    }
  }

  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blockTitle.trim()) {
      setError(t("dashboard.pages.links.errors.blockTitleRequired"));
      return;
    }
    let blockData: Record<string, unknown> = {};
    let blockUrl: string | undefined;
    if (blockType === "video") {
      if (!blockVideoUrl.trim()) {
        setError(t("dashboard.pages.links.errors.videoUrlRequired"));
        return;
      }
      blockData = { video_url: blockVideoUrl.trim() };
    } else if (blockType === "faq") {
      const items = blockFaqItems.filter((it) => it.question.trim() && !isRichTextEmpty(it.answer));
      if (items.length === 0) {
        setError(t("dashboard.pages.links.errors.faqRequired"));
        return;
      }
      blockData = { items };
    } else if (blockType === "maps") {
      if (!blockMapsUrl.trim()) {
        setError(t("dashboard.pages.links.errors.mapsUrlRequired"));
        return;
      }
      blockUrl = blockMapsUrl.trim();
      blockData = { embed: blockMapsEmbed };
    } else if (blockType === "text") {
      if (!blockText.trim()) {
        setError(t("dashboard.pages.links.errors.textRequired"));
        return;
      }
      blockData = { text: blockText.trim() };
    } else if (blockType === "accordion") {
      if (!blockAccordionText.trim()) {
        setError(t("dashboard.pages.links.errors.accordionTextRequired"));
        return;
      }
      blockData = { text: blockAccordionText.trim() };
    } else if (blockType === "project_showcase") {
      if (!blockShowcaseUrl.trim()) {
        setError(t("dashboard.pages.links.errors.ctaUrlRequired"));
        return;
      }
      blockUrl = blockShowcaseUrl.trim();
      blockData = { badge_text: blockShowcaseBadge.trim(), cta_text: blockShowcaseCta.trim() };
    } else if (blockType === "button") {
      // "button" -- reuse title/url apa adanya (SAMA seperti tautan biasa),
      // backend sengaja TIDAK punya validasi block_data khusus utk tipe ini.
      // Mode WhatsApp (14 September 2026) -- url TETAP satu-satunya sumber
      // kebenaran tujuan klik (dirakit dari nomor+pesan di sini), whatsapp_
      // number/whatsapp_message disimpan APA ADANYA di block_data cuma
      // supaya kreator bisa buka & edit lagi tanpa mem-parse balik URL.
      if (blockButtonMode === "whatsapp") {
        if (!blockButtonWhatsappNumber.trim()) {
          setError(t("dashboard.pages.links.errors.whatsappNumberRequired"));
          return;
        }
        blockUrl = buildWhatsappButtonUrl(blockButtonWhatsappNumber, blockButtonWhatsappMessage);
        blockData = { whatsapp_number: blockButtonWhatsappNumber.trim(), whatsapp_message: blockButtonWhatsappMessage.trim() };
      } else {
        if (!blockButtonUrl.trim()) {
          setError(t("dashboard.pages.links.errors.buttonUrlRequired"));
          return;
        }
        blockUrl = blockButtonUrl.trim();
      }
    } else if (blockType === "countdown") {
      if (!blockCountdownTargetAt) {
        setError(t("dashboard.pages.links.errors.countdownTargetRequired"));
        return;
      }
      // product_id/cta_label/cta_url -- susulan 14 September 2026 (kaitkan
      // countdown ke produk utk flash sale, atau CTA generik kalau tidak
      // ada produk dipilih -- lihat renderCountdownAction, PagePreview.tsx).
      blockData = {
        target_at: new Date(blockCountdownTargetAt).toISOString(),
        product_id: blockCountdownProductId || undefined,
        cta_label: blockCountdownProductId ? undefined : blockCountdownCtaLabel.trim() || undefined,
        cta_url: blockCountdownProductId ? undefined : blockCountdownCtaUrl.trim() || undefined,
      };
    } else if (blockType === "embed") {
      if (!blockEmbedUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedUrlRequired"));
        return;
      }
      blockData = { embed_url: blockEmbedUrl.trim() };
    } else if (blockType === "video_image") {
      // video_url opsional (gambar diisi SETELAH blok dibuat lewat panel
      // "Kelola Gambar", pola shell-first sama seperti gallery/file) --
      // backend menerima video_url/image_url independen, tidak ada yang
      // wajib.
      if (blockVideoImageVideoUrl.trim()) blockData = { video_url: blockVideoImageVideoUrl.trim() };
    } else if (blockType === "embed_link") {
      if (!blockEmbedLinkUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedLinkUrlRequired"));
        return;
      }
      blockUrl = blockEmbedLinkUrl.trim();
    } else if (blockType === "list") {
      // "list" -- validasi backend longgar (item cuma perlu berupa object,
      // TIDAK wajib title/description terisi) -- BEDA dari FAQ top-level,
      // jadi item kosong pun boleh terkirim, buang baris yang benar-benar
      // kosong semua (title+description+author) supaya tidak menyisakan
      // sampah kalau kreator batal mengisi.
      const items = blockListItems.filter((it) => it.title.trim() || it.description.trim() || it.author.trim() || it.url?.trim());
      blockData = { style: blockListStyle, items };
    }
    setError(null);
    setSavingBlock(true);
    try {
      const created = await currentCreateBlock({
        block_type: blockType,
        title: blockTitle.trim(),
        url: blockUrl,
        block_data: blockData,
        description:
          blockType === "project_showcase"
            ? blockShowcaseDescription.trim()
            : blockType === "embed_link"
              ? blockEmbedLinkDescription.trim()
              : undefined,
      });
      setLinks((prev) => [...prev, created]);
      // Auto-buka BlockDrilldownEditor setelah blok "catalog" baru dibuat --
      // tanpa ini kreator mendarat di baris kosong tanpa cara masuk (blok
      // "faq" tidak butuh ini, form buat FAQ sudah mengumpulkan pertanyaan
      // pertama di awal).
      if (blockType === "catalog") setDrilldownBlockId(created.id);
      setAddingBlock(false);
      setBlockTitle("");
      setBlockVideoUrl("");
      setBlockFaqItems([{ question: "", answer: "" }]);
      setBlockAccordionText("");
      setBlockMapsUrl("");
      setBlockMapsEmbed(true);
      setBlockText("");
      setBlockShowcaseUrl("");
      setBlockShowcaseDescription("");
      setBlockShowcaseBadge("");
      setBlockShowcaseCta("");
      setBlockButtonUrl("");
      setBlockButtonMode("url");
      setBlockButtonWhatsappNumber("");
      setBlockButtonWhatsappMessage("");
      setBlockCountdownTargetAt("");
      setBlockCountdownProductId("");
      setBlockCountdownCtaLabel("");
      setBlockCountdownCtaUrl("");
      setBlockEmbedUrl("");
      setBlockVideoImageVideoUrl("");
      setBlockEmbedLinkUrl("");
      setBlockEmbedLinkDescription("");
      setBlockListStyle("list");
      setBlockListItems([{ title: "", description: "", author: "" }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.createBlockFailed"));
    } finally {
      setSavingBlock(false);
    }
  }

  function openContentEdit(link: LinkItem) {
    setContentEditId(link.id);
    if (link.block_type === "video") {
      setEditVideoUrl((link.block_data?.video_url as string) ?? "");
    } else if (link.block_type === "maps") {
      setEditMapsUrl(link.url ?? "");
      setEditMapsEmbed(Boolean(link.block_data?.embed));
    } else if (link.block_type === "text") {
      setEditText((link.block_data?.text as string) ?? "");
    } else if (link.block_type === "accordion") {
      setEditAccordionText((link.block_data?.text as string) ?? "");
    } else if (link.block_type === "project_showcase") {
      setEditShowcaseUrl(link.url ?? "");
      setEditShowcaseDescription(link.description ?? "");
      setEditShowcaseBadge((link.block_data?.badge_text as string) ?? "");
      setEditShowcaseCta((link.block_data?.cta_text as string) ?? "");
    } else if (link.block_type === "button") {
      setEditButtonUrl(link.url ?? "");
      const savedWhatsappNumber = (link.block_data?.whatsapp_number as string) ?? "";
      setEditButtonMode(savedWhatsappNumber ? "whatsapp" : "url");
      setEditButtonWhatsappNumber(savedWhatsappNumber);
      setEditButtonWhatsappMessage((link.block_data?.whatsapp_message as string) ?? "");
    } else if (link.block_type === "countdown") {
      setEditCountdownTargetAt(toDatetimeLocalValue(link.block_data?.target_at as string | undefined));
      setEditCountdownProductId((link.block_data?.product_id as string) ?? "");
      setEditCountdownCtaLabel((link.block_data?.cta_label as string) ?? "");
      setEditCountdownCtaUrl((link.block_data?.cta_url as string) ?? "");
    } else if (link.block_type === "embed") {
      setEditEmbedUrl((link.block_data?.embed_url as string) ?? "");
    } else if (link.block_type === "video_image") {
      setEditVideoImageVideoUrl((link.block_data?.video_url as string) ?? "");
    } else if (link.block_type === "embed_link") {
      setEditEmbedLinkUrl(link.url ?? "");
      setEditEmbedLinkDescription(link.description ?? "");
    }
  }

  // toggleContentEdit -- redesain "Konsisten & Ringkas" (14 September
  // 2026): pemicu accordion SEKARANG dipakai bersama utk SEMUA tipe blok
  // (bukan cuma 10 tipe lama), TAPI openContentEdit() di atas WAJIB tetap
  // dipanggil saat MEMBUKA (bukan setContentEditId langsung) -- fungsi itu
  // JUGA menyalin nilai `link` SAAT INI ke buffer edit lokal (editVideoUrl,
  // editText, dst., SATU state per field, dipakai BERGANTIAN oleh blok
  // manapun yang sedang terbuka) utk 10 tipe yang punya form berbasis
  // buffer -- melewatinya akan menampilkan nilai BASI dari blok lain yang
  // terakhir dibuka. Tipe lain (produk/galeri/dst.) tidak punya buffer
  // sama sekali, jadi memanggil openContentEdit utk itu aman/no-op.
  function toggleContentEdit(link: LinkItem) {
    if (contentEditId === link.id) {
      setContentEditId(null);
    } else {
      openContentEdit(link);
    }
  }

  async function handleSaveContent(link: LinkItem) {
    let blockData: Record<string, unknown>;
    let blockUrl: string | undefined;
    let blockDescription: string | undefined;
    if (link.block_type === "video") {
      if (!editVideoUrl.trim()) {
        setError(t("dashboard.pages.links.errors.videoUrlRequired"));
        return;
      }
      blockData = { video_url: editVideoUrl.trim() };
    } else if (link.block_type === "maps") {
      if (!editMapsUrl.trim()) {
        setError(t("dashboard.pages.links.errors.mapsUrlRequired"));
        return;
      }
      blockUrl = editMapsUrl.trim();
      blockData = { embed: editMapsEmbed };
    } else if (link.block_type === "text") {
      if (!editText.trim()) {
        setError(t("dashboard.pages.links.errors.textRequired"));
        return;
      }
      blockData = { text: editText.trim() };
    } else if (link.block_type === "accordion") {
      if (!editAccordionText.trim()) {
        setError(t("dashboard.pages.links.errors.accordionTextRequired"));
        return;
      }
      blockData = { text: editAccordionText.trim() };
    } else if (link.block_type === "project_showcase") {
      if (!editShowcaseUrl.trim()) {
        setError(t("dashboard.pages.links.errors.ctaUrlRequired"));
        return;
      }
      blockUrl = editShowcaseUrl.trim();
      blockDescription = editShowcaseDescription.trim();
      // ...link.block_data -- bug ditemukan lewat review 12 September 2026
      // (menulis panel serupa utk video_image/embed_link): SEBELUMNYA
      // baris ini mengganti block_data UTUH dgn cuma {badge_text,cta_text},
      // MENGHAPUS image_url yang sudah diunggah lewat panel "Kelola gambar"
      // terpisah (endpoint PATCH generik ini MENGGANTI block_data
      // sepenuhnya, bukan merge -- lihat catatan Update handler, links.go)
      // -- kalau kreator edit isi SETELAH unggah gambar, gambar hilang
      // diam-diam. Spread dulu supaya field yang tidak disentuh form ini
      // tetap aman.
      blockData = { ...link.block_data, badge_text: editShowcaseBadge.trim(), cta_text: editShowcaseCta.trim() };
    } else if (link.block_type === "button") {
      if (editButtonMode === "whatsapp") {
        if (!editButtonWhatsappNumber.trim()) {
          setError(t("dashboard.pages.links.errors.whatsappNumberRequired"));
          return;
        }
        blockUrl = buildWhatsappButtonUrl(editButtonWhatsappNumber, editButtonWhatsappMessage);
        blockData = { whatsapp_number: editButtonWhatsappNumber.trim(), whatsapp_message: editButtonWhatsappMessage.trim() };
      } else {
        if (!editButtonUrl.trim()) {
          setError(t("dashboard.pages.links.errors.buttonUrlRequired"));
          return;
        }
        blockUrl = editButtonUrl.trim();
        blockData = {};
      }
    } else if (link.block_type === "countdown") {
      if (!editCountdownTargetAt) {
        setError(t("dashboard.pages.links.errors.countdownTargetRequired"));
        return;
      }
      blockData = {
        target_at: new Date(editCountdownTargetAt).toISOString(),
        product_id: editCountdownProductId || undefined,
        cta_label: editCountdownProductId ? undefined : editCountdownCtaLabel.trim() || undefined,
        cta_url: editCountdownProductId ? undefined : editCountdownCtaUrl.trim() || undefined,
      };
    } else if (link.block_type === "embed") {
      if (!editEmbedUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedUrlRequired"));
        return;
      }
      blockData = { embed_url: editEmbedUrl.trim() };
    } else if (link.block_type === "video_image") {
      // ...link.block_data -- SAMA seperti catatan project_showcase di
      // atas: video_image punya image_url yang diisi lewat panel "Kelola
      // Gambar" terpisah (uploadBuilderMediaImage), spread dulu supaya
      // tidak ikut terhapus saat cuma video_url yang diubah di sini.
      blockData = { ...link.block_data, video_url: editVideoImageVideoUrl.trim() };
    } else if (link.block_type === "embed_link") {
      if (!editEmbedLinkUrl.trim()) {
        setError(t("dashboard.pages.links.errors.embedLinkUrlRequired"));
        return;
      }
      blockUrl = editEmbedLinkUrl.trim();
      blockDescription = editEmbedLinkDescription.trim();
      // ...link.block_data -- SAMA alasan video_image di atas (image_url
      // dikelola panel terpisah).
      blockData = { ...link.block_data };
    } else {
      // Dulu `else` polos menampung FAQ tanpa cek block_type eksplisit --
      // diperbaiki 6 September 2026 (audit BlockDrilldownEditor) supaya
      // tipe blok yang TIDAK dikenal fungsi ini tidak diam-diam tersimpan
      // sebagai data FAQ.
      return;
    }
    setError(null);
    setSavingContent(true);
    try {
      await updateLink(link.id, { url: blockUrl, block_data: blockData, description: blockDescription });
      const refreshed = await refreshLinks();
      setLinks(refreshed);
      setContentEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.saveBlockContentFailed"));
    } finally {
      setSavingContent(false);
    }
  }

  // persistOrder -- dipakai bersama oleh drag-drop DAN tombol naik/turun
  // keyboard: hitung ulang position lalu simpan ke server (satu jalur, tidak
  // ada logika reorder yang terduplikasi/menyimpang antar dua cara).
  function persistOrder(reordered: typeof links) {
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(withPositions);
    currentReorderLinks(withPositions.map((l) => ({ id: l.id, position: l.position }))).catch((err) => {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.reorderFailed"));
    });
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = links.findIndex((l) => l.id === dragId);
    const to = links.findIndex((l) => l.id === targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...links];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setDragId(null);
    persistOrder(reordered);
  }

  // Alternatif keyboard untuk drag-reorder (DASHBOARD-DESIGN-JEONID.md §22
  // "drag alternative move up/down"): geser satu tautan naik/turun satu
  // langkah lewat tombol yang bisa difokus keyboard, tanpa perlu drag mouse.
  function moveLinkByOffset(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= links.length) return;
    const reordered = [...links];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(to, 0, moved);
    persistOrder(reordered);
  }

  if (loading) return <PageSkeleton />;

  return (
    // HalamanSayaTabs -- editor bertab (§9), tab "Konten" aktif di halaman
    // ini. Grid 2-kolom (konten+pratinjau) lama dipertahankan persis di
    // bawahnya. Lihat catatan lebar/pratinjau di DesignPageShell.tsx.
    <>
    <HalamanSayaTabs />
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      {/* min-w-0 (bug dilaporkan pengguna, 18 Agustus 2026, produksi
          jeon.id: "pratinjau itu ga responsif, ketika zoom 100% keatas
          tampilan nya jadi rusak") -- kolom "1fr" ini SEBELUMNYA tidak
          punya min-w-0 sama sekali, beda dari kolom setara di
          dashboard/products/page.tsx yang SUDAH diperbaiki utk bug SEJENIS
          sejak 5 Agustus 2026. Grid item defaultnya min-width:auto (pola
          berulang di repo ini, lihat CLAUDE.md) -- menolak menyusut di
          bawah lebar intrinsik kontennya (baris ikon toolbar tiap kartu
          tautan: jam/gembok/kamera/grid/bintang, TIDAK bisa melipat).
          Memperbesar zoom browser mengecilkan lebar viewport CSS efektif
          (lebih sedikit piksel CSS muat di layar fisik yang sama) --
          begitu ruang yang tersedia untuk kolom ini turun di bawah lebar
          intrinsik itu, grid dipaksa melebar melebihi kontainer, mendorong
          kolom pratinjau (360px) & seluruh halaman ikut rusak/overflow. */}
      {/* min-w-0 disembunyikan (BUKAN unmount) lewat "hidden" saat
          BlockDrilldownEditor terbuka (6 September 2026, redesain gaya
          Linktree) -- display:none menjaga posisi scroll & state DOM daftar
          supaya kembali dari drill-down mendarat persis di tempat semula,
          dan otomatis mencegah pill halaman-tambahan (switchToPage) diklik
          selagi sedang di dalam editor blok. */}
      <div className={`min-w-0 ${drilldownBlock || contentEditingLink ? "hidden" : ""}`}>
        {/* Pill navigasi halaman -- Modul Halaman Tambahan Fase 2 (permintaan
            langsung pengguna, 28 Agustus 2026, referensi UI kompetitor "+
            Page" + navigation pill): "Home" = halaman utama, satu pill per
            halaman tambahan (bio/landing) yang dibuat lewat "+ Page" di
            bawah. Mengeklik pill mengganti SELURUH state page/links yang
            dirender di bawah (lihat switchToPage) -- builder blok, baris
            profil, & pratinjau semuanya otomatis ikut halaman yang aktif,
            TIDAK ada UI terpisah. Halaman Toko (page_type "produk") sengaja
            TIDAK muncul di sini -- keputusan langsung pengguna, tetap
            dikelola lewat menu Toko (Produk & Monetisasi). */}
        <p className="mt-1 text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.pages.links.pageNav.heading")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => switchToPage(null)}
            disabled={switchingPage || activePage === null}
            className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors disabled:cursor-default ${
              activePage === null ? "bg-jeon-sidebar text-white" : "bg-surface-2 text-app-muted hover:text-app-ink"
            }`}
          >
            Home
          </button>
          {extraPages.map((ep) => (
            <button
              key={ep.id}
              type="button"
              onClick={() => switchToPage({ id: ep.id, slug: ep.slug, pageType: ep.page_type === "landing" ? "landing" : "bio" })}
              disabled={switchingPage || activePage?.id === ep.id}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors disabled:cursor-default ${
                activePage?.id === ep.id ? "bg-jeon-sidebar text-white" : "bg-surface-2 text-app-muted hover:text-app-ink"
              }`}
            >
              {ep.name}
              {!ep.is_published && (
                <span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">{t("dashboard.pages.links.pageNav.draft")}</span>
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
              if (extraPages.length >= PREMIUM_EXTRA_PAGE_LIMIT) {
                setError(t("dashboard.pages.links.errors.extraPageLimitReached").replace("{limit}", String(PREMIUM_EXTRA_PAGE_LIMIT)));
                return;
              }
              setNewPageTitle("");
              setDuplicateFromId("");
              setCreatingPage(true);
            }}
            title={!page?.is_premium ? t("dashboard.pages.links.pageNav.premiumOnly") : undefined}
            className="flex items-center gap-1 rounded-full border border-dashed border-app-border px-3 py-1.5 text-sm font-bold text-app-muted hover:border-jeon-purple hover:text-jeon-purple"
          >
            <IconPlus className="h-3.5 w-3.5" />
            Page
            {!page?.is_premium && <IconStar className="h-3 w-3 text-jeon-purple" />}
          </button>
        </div>

        {activePage &&
          (() => {
            const activeExtraPage = extraPages.find((p) => p.id === activePage.id);
            if (!activeExtraPage) return null;
            return (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-muted">
                {renamingPage ? (
                  <input
                    type="text"
                    autoFocus
                    value={renamePageValue}
                    onChange={(e) => setRenamePageValue(e.target.value)}
                    onBlur={saveRenamePage}
                    onKeyDown={(e) => e.key === "Enter" && saveRenamePage()}
                    className="rounded-md border border-jeon-purple px-2 py-0.5 text-xs text-app-ink focus:outline-none"
                  />
                ) : (
                  <button type="button" onClick={() => startRenamePage(activeExtraPage)} className="flex items-center gap-1 hover:text-jeon-purple">
                    <IconPencil className="h-3 w-3" /> {t("dashboard.pages.links.pageNav.renamePage")}
                  </button>
                )}
                <label className="flex items-center gap-1.5">
                  <Toggle checked={activeExtraPage.is_published} onChange={() => handleTogglePagePublish(activeExtraPage)} />
                  {t("dashboard.pages.links.pageNav.publish")}
                </label>
                <label className="flex items-center gap-1.5" title={t("dashboard.pages.links.pageNav.showProfileHeaderHint")}>
                  <Toggle checked={page?.show_profile_header ?? true} onChange={handleToggleShowProfileHeader} />
                  {t("dashboard.pages.links.pageNav.showProfileHeader")}
                </label>
                <button type="button" onClick={() => handleDeletePage(activeExtraPage)} className="flex items-center gap-1 text-red-500 hover:underline">
                  <IconTrash className="h-3 w-3" /> {t("dashboard.pages.links.pageNav.deletePage")}
                </button>
              </div>
            );
          })()}

        <p className="mt-3 text-sm text-app-muted">{t("dashboard.pages.links.dragToReorderHint")}</p>

        {/* Baris profil -- BISA DIEDIT langsung dari sini (permintaan
            langsung pengguna): nama tampilan & bio inline-editable (ikon
            pensil, pola sama seperti edit judul/URL tautan), avatar bisa
            diganti dengan klik. Tetap satu sumber kebenaran yang SAMA
            dengan halaman Desain (updateMyPage/uploadAvatar yang sama),
            cuma sekarang ada 2 pintu masuk untuk mengeditnya. */}
        {page && (
          <div className="mt-4 flex items-start gap-3">
            <button
              type="button"
              disabled={avatarUploading}
              onClick={() => document.getElementById("links-avatar-input")?.click()}
              title={t("dashboard.pages.links.profile.changeAvatar")}
              className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-card disabled:opacity-60"
            >
              {page.avatar_url ? (
                // Ukuran TETAP 56px -- tombol pembungkusnya h-14 w-14.
                // avatar_url bisa berupa URL googleusercontent mentah untuk
                // akun daftar-lewat-Google, sudah didaftarkan di
                // images.remotePatterns (next.config.js).
                <Image src={page.avatar_url} alt={page.username} width={56} height={56} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-jeon-purple/10 font-display text-lg font-bold text-jeon-purple">
                  {page.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-ink/70 text-white">
                <IconCamera className="h-2.5 w-2.5" />
              </span>
            </button>
            <input
              id="links-avatar-input"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <div className="min-w-0 flex-1">
              {editingProfileField === "name" ? (
                <input
                  type="text"
                  autoFocus
                  value={profileEditValue}
                  onChange={(e) => setProfileEditValue(e.target.value)}
                  onBlur={saveEditProfileField}
                  onKeyDown={(e) => e.key === "Enter" && saveEditProfileField()}
                  placeholder={page.username}
                  className="w-full rounded-md border border-jeon-purple px-2 py-1 font-display text-base font-bold text-app-ink focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-display text-base font-bold text-app-ink">{page.display_name || page.username}</p>
                  <button type="button" onClick={() => startEditProfileField("name")} className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.profile.editDisplayName")}>
                    <IconPencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {editingProfileField === "bio" ? (
                <input
                  type="text"
                  autoFocus
                  value={profileEditValue}
                  onChange={(e) => setProfileEditValue(e.target.value)}
                  onBlur={saveEditProfileField}
                  onKeyDown={(e) => e.key === "Enter" && saveEditProfileField()}
                  placeholder={t("dashboard.pages.links.profile.addBioPlaceholder")}
                  maxLength={160}
                  className="mt-1 w-full rounded-md border border-jeon-purple px-2 py-1 text-sm text-app-muted focus:outline-none"
                />
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="truncate text-sm text-app-muted">{page.bio || t("dashboard.pages.links.profile.addBioPlaceholder")}</p>
                  <button type="button" onClick={() => startEditProfileField("bio")} className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.profile.editBio")}>
                    <IconPencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Kontak Sosial -- permintaan langsung pengguna, 11 Agustus 2026:
            "dibagian profile atau menu link bio itu bisa mengisi kontak
            instagram tiktok facebook whatsapp dll jika mengisi bisa kita
            tampilkan di bagian bawah deskripsi nya saat akses link dan
            sudah built in icon nya" -- diisi di sini, dirender sebagai baris
            ikon bulat di bawah bio halaman publik (lihat renderSocialRow di
            PagePreview.tsx). Panel kolaps (bukan 9 field selalu terbuka)
            supaya tidak bikin bagian atas halaman ini penuh buat kreator
            yang belum butuh fitur ini. */}
        {page && (
          <div className="mt-3 rounded-xl border border-app-border">
            <button
              type="button"
              onClick={() => (socialOpen ? setSocialOpen(false) : openSocialPanel())}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-app-ink"
            >
              {t("dashboard.pages.links.social.heading")}
              <IconChevronRight className={`h-3.5 w-3.5 text-app-muted transition-transform ${socialOpen ? "rotate-90" : ""}`} />
            </button>
            {socialOpen && (
              <div className="border-t border-app-border p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SOCIAL_PLATFORMS.map((p) => (
                    <div key={p.key} className="flex items-center gap-2">
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${p.badgeClass}`}>
                        <p.Icon className="h-3.5 w-3.5" />
                      </span>
                      <input
                        type="text"
                        value={socialDraft[p.key] ?? ""}
                        onChange={(e) => setSocialDraft((prev) => ({ ...prev, [p.key]: e.target.value }))}
                        placeholder={`${p.label} · ${p.placeholder}`}
                        aria-label={p.label}
                        className="w-full min-w-0 rounded-lg border border-app-border px-2.5 py-2 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-app-muted">
                  {t("dashboard.pages.links.social.hint")}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={saveSocial}
                    disabled={savingSocial}
                    className="rounded-lg btn-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {savingSocial ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                  </button>
                  <button type="button" onClick={() => setSocialOpen(false)} className="text-xs font-semibold text-app-muted hover:text-app-ink">
                    {t("dashboard.pages.links.common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setAddCategory("populer");
            setAddSearch("");
            setAddModalOpen(true);
          }}
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
        >
          <IconPlus className="h-4 w-4" />
          {t("dashboard.pages.links.quickAdd.addButton")}
        </button>

        {/* Canvas Page Builder (migrasi 000096, permintaan langsung
            pengguna 7 September 2026, dua screenshot Lynk.id): cara KEDUA
            mengedit konten, di samping editor daftar vertikal di atas --
            navigasi ke route builder terpisah (bukan modal/toggle inline)
            supaya kanvas besarnya dapat layar penuh. Route tujuan sendiri
            yang PATCH builder_mode='builder' begitu dibuka (idempoten),
            jadi tautan ini cukup navigasi apa adanya. pageId "main" utk
            halaman utama, id halaman tambahan selain itu -- konvensi BARU
            route ini (lihat catatan lengkap di page.tsx-nya). */}
        <Link
          href={`/builder/${activePage ? activePage.id : "main"}`}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border-2 border-jeon-ink bg-app-surface py-2.5 text-sm font-bold text-app-ink transition-transform hover:scale-[1.01]"
        >
          <IconColumns className="h-4 w-4" />
          {t("dashboard.pages.links.openBuilderMode")}
        </Link>

        {addingLink && (
          <form onSubmit={handleCreateLink} className="glass mt-4 flex flex-col gap-2 rounded-jlg p-4 shadow-card">
            <div className="flex flex-col gap-2 sm:flex-row">
              <FormField label={t("dashboard.pages.links.addLinkForm.titleLabel")} hint={t("dashboard.pages.links.addLinkForm.titleHint")}>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={t("dashboard.pages.links.addLinkForm.titlePlaceholder")}
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </FormField>
              <FormField label={t("dashboard.pages.links.addLinkForm.urlLabel")} hint={t("dashboard.pages.links.addLinkForm.urlHint")}>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={newURL}
                  onChange={(e) => setNewURL(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                />
              </FormField>
            </div>
            {/* description -- permintaan langsung pengguna, 24 Agustus
                2026: subjudul opsional (kartu ikon+judul+deskripsi+panah,
                contoh template "Dimas Dev"). Kosong = baris judul tunggal
                seperti sebelumnya. */}
            <FormField label={t("dashboard.pages.links.addLinkForm.descriptionLabel")} hint={t("dashboard.pages.links.addLinkForm.descriptionHint")}>
              <input
                type="text"
                placeholder={t("dashboard.pages.links.addLinkForm.descriptionPlaceholder")}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={240}
                className="w-full rounded-lg border border-app-border px-3.5 py-2.5 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </FormField>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingLink(false)}
                className="rounded-lg border-2 border-jeon-ink px-4 py-2.5 text-sm font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.links.common.cancel")}
              </button>
              <button type="submit" className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white">
                {t("dashboard.pages.links.quickAdd.addButton")}
              </button>
            </div>
          </form>
        )}

        {addingBlock && (
          <form onSubmit={handleCreateBlock} className="glass mt-4 flex flex-col gap-2 rounded-jlg p-3.5 shadow-card">
            <FormField label={t("dashboard.pages.links.addBlockForm.blockTypeLabel")}>
              <select
                value={blockType}
                onChange={(e) =>
                  setBlockType(
                    e.target.value as
                      | "video"
                      | "contact_form"
                      | "faq"
                      | "maps"
                      | "text"
                      | "accordion"
                      | "gallery"
                      | "audio"
                      | "file"
                      | "project_showcase"
                      | "catalog"
                      | "button"
                      | "image"
                      | "video_image"
                      | "image_slider"
                      | "list"
                      | "countdown"
                      | "produk"
                      | "embed_link"
                      | "embed"
                  )
                }
                className="bg-app-surface text-app-ink w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
              >
                <option value="video">{t("dashboard.pages.links.blockForm.options.video")}</option>
                <option value="contact_form">{t("dashboard.pages.links.blockForm.options.contactForm")}</option>
                <option value="faq">{t("dashboard.pages.links.blockForm.options.faq")}</option>
                <option value="accordion">{t("dashboard.pages.links.blockForm.options.accordion")}</option>
                <option value="maps">{t("dashboard.pages.links.blockForm.options.maps")}</option>
                <option value="text">{t("dashboard.pages.links.blockForm.options.text")}</option>
                <option value="gallery">{t("dashboard.pages.links.blockForm.options.gallery")}</option>
                <option value="audio">{t("dashboard.pages.links.blockForm.options.audio")}</option>
                <option value="file">{t("dashboard.pages.links.blockForm.options.file")}</option>
                <option value="project_showcase">{t("dashboard.pages.links.blockForm.options.projectShowcase")}</option>
                <option value="catalog">{t("dashboard.pages.links.blockForm.options.catalog")}</option>
                <option value="button">{t("dashboard.pages.links.blockForm.options.button")}</option>
                <option value="image">{t("dashboard.pages.links.blockForm.options.image")}</option>
                <option value="video_image">{t("dashboard.pages.links.blockForm.options.videoImage")}</option>
                <option value="image_slider">{t("dashboard.pages.links.blockForm.options.imageSlider")}</option>
                <option value="list">{t("dashboard.pages.links.blockForm.options.list")}</option>
                <option value="countdown">{t("dashboard.pages.links.blockForm.options.countdown")}</option>
                <option value="produk">{t("dashboard.pages.links.blockForm.options.produk")}</option>
                <option value="embed_link">{t("dashboard.pages.links.blockForm.options.embedLink")}</option>
                <option value="embed">{t("dashboard.pages.links.blockForm.options.embed")}</option>
              </select>
            </FormField>
            {(blockType === "gallery" ||
              blockType === "audio" ||
              blockType === "file" ||
              blockType === "project_showcase" ||
              blockType === "catalog" ||
              blockType === "image" ||
              blockType === "image_slider" ||
              blockType === "video_image" ||
              blockType === "embed_link" ||
              blockType === "produk") && (
              <p className="rounded-lg bg-jeon-purple/5 px-3 py-2 text-[11px] text-app-muted">
                {blockType === "gallery"
                  ? t("dashboard.pages.links.blockForm.uploadHints.gallery")
                  : blockType === "audio"
                  ? t("dashboard.pages.links.blockForm.uploadHints.audio")
                  : blockType === "file"
                  ? t("dashboard.pages.links.blockForm.uploadHints.file")
                  : blockType === "catalog"
                  ? t("dashboard.pages.links.blockForm.uploadHints.catalog")
                  : blockType === "project_showcase"
                  ? t("dashboard.pages.links.blockForm.uploadHints.projectShowcase")
                  : blockType === "image"
                  ? t("dashboard.pages.links.blockForm.uploadHints.image")
                  : blockType === "image_slider"
                  ? t("dashboard.pages.links.blockForm.uploadHints.imageSlider")
                  : blockType === "video_image"
                  ? t("dashboard.pages.links.blockForm.uploadHints.videoImage")
                  : blockType === "embed_link"
                  ? t("dashboard.pages.links.blockForm.uploadHints.embedLink")
                  : t("dashboard.pages.links.blockForm.uploadHints.produk")}
              </p>
            )}
            <FormField
              label={blockType === "project_showcase" ? t("dashboard.pages.links.blockForm.titleLabel.project") : t("dashboard.pages.links.blockForm.titleLabel.default")}
              hint={
                blockType === "text"
                  ? t("dashboard.pages.links.blockForm.titleHint.text")
                  : blockType === "accordion"
                  ? t("dashboard.pages.links.blockForm.titleHint.accordion")
                  : blockType === "project_showcase"
                  ? t("dashboard.pages.links.blockForm.titleHint.projectShowcase")
                  : undefined
              }
            >
              <input
                type="text"
                required
                placeholder={
                  blockType === "text"
                    ? t("dashboard.pages.links.blockForm.titlePlaceholder.text")
                    : blockType === "accordion"
                    ? t("dashboard.pages.links.blockForm.titlePlaceholder.accordion")
                    : blockType === "project_showcase"
                    ? t("dashboard.pages.links.blockForm.titlePlaceholder.projectShowcase")
                    : t("dashboard.pages.links.blockForm.titlePlaceholder.default")
                }
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
              />
            </FormField>
            {blockType === "project_showcase" && (
              <div className="flex flex-col gap-2">
                <FormField label={t("dashboard.pages.links.blockForm.showcase.badgeLabel")} hint={t("dashboard.pages.links.blockForm.showcase.badgeHint")}>
                  <input
                    type="text"
                    placeholder={t("dashboard.pages.links.blockForm.showcase.badgePlaceholder")}
                    value={blockShowcaseBadge}
                    onChange={(e) => setBlockShowcaseBadge(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.descriptionLabel")} hint={t("dashboard.pages.links.blockForm.showcase.descriptionHint")}>
                  <RichTextEditor html={blockShowcaseDescription} onChange={setBlockShowcaseDescription} />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaUrlLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaUrlHint")}>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={blockShowcaseUrl}
                    onChange={(e) => setBlockShowcaseUrl(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaTextLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaTextHint")}>
                  <input
                    type="text"
                    placeholder={t("dashboard.pages.links.blockForm.showcase.ctaTextPlaceholder")}
                    value={blockShowcaseCta}
                    onChange={(e) => setBlockShowcaseCta(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
              </div>
            )}
            {blockType === "text" && (
              <FormField label={t("dashboard.pages.links.blockForm.text.label")}>
                <RichTextEditor html={blockText} onChange={setBlockText} />
              </FormField>
            )}
            {blockType === "accordion" && (
              <FormField label={t("dashboard.pages.links.blockForm.accordion.label")}>
                <RichTextEditor html={blockAccordionText} onChange={setBlockAccordionText} />
              </FormField>
            )}
            {blockType === "button" && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-1.5">
                  {(["url", "whatsapp"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setBlockButtonMode(mode)}
                      className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        blockButtonMode === mode ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                      }`}
                    >
                      {mode === "url" ? t("dashboard.pages.links.blockForm.button.modeUrl") : t("dashboard.pages.links.blockForm.button.modeWhatsapp")}
                    </button>
                  ))}
                </div>
                {blockButtonMode === "whatsapp" ? (
                  <>
                    <FormField label={t("dashboard.pages.links.blockForm.button.whatsappNumberLabel")}>
                      <input
                        type="tel"
                        required
                        placeholder={t("dashboard.pages.links.blockForm.button.whatsappNumberPlaceholder")}
                        value={blockButtonWhatsappNumber}
                        onChange={(e) => setBlockButtonWhatsappNumber(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.button.whatsappMessageLabel")}>
                      <textarea
                        placeholder={t("dashboard.pages.links.blockForm.button.whatsappMessagePlaceholder")}
                        value={blockButtonWhatsappMessage}
                        onChange={(e) => setBlockButtonWhatsappMessage(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <p className="text-[11px] text-app-muted">{t("dashboard.pages.links.blockForm.button.whatsappHint")}</p>
                  </>
                ) : (
                  <FormField label={t("dashboard.pages.links.blockForm.button.urlLabel")}>
                    <input
                      type="url"
                      required
                      placeholder="https://..."
                      value={blockButtonUrl}
                      onChange={(e) => setBlockButtonUrl(e.target.value)}
                      className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                    />
                  </FormField>
                )}
              </div>
            )}
            {blockType === "countdown" && (
              <div className="flex flex-col gap-3">
                <FormField label={t("dashboard.pages.links.blockForm.countdown.targetLabel")}>
                  <input
                    type="datetime-local"
                    required
                    value={blockCountdownTargetAt}
                    onChange={(e) => setBlockCountdownTargetAt(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.countdown.productLabel")} hint={t("dashboard.pages.links.blockForm.countdown.productHint")}>
                  <select
                    value={blockCountdownProductId}
                    onChange={(e) => setBlockCountdownProductId(e.target.value)}
                    className="bg-app-surface text-app-ink w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  >
                    <option value="">{t("dashboard.pages.links.blockForm.countdown.noProduct")}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                {!blockCountdownProductId && (
                  <>
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaLabelLabel")}>
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.blockForm.countdown.ctaLabelPlaceholder")}
                        value={blockCountdownCtaLabel}
                        onChange={(e) => setBlockCountdownCtaLabel(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaUrlLabel")}>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={blockCountdownCtaUrl}
                        onChange={(e) => setBlockCountdownCtaUrl(e.target.value)}
                        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  </>
                )}
              </div>
            )}
            {blockType === "embed" && (
              <FormField label={t("dashboard.pages.links.blockForm.embed.urlLabel")} hint={t("dashboard.pages.links.blockForm.embed.urlHint")}>
                <input
                  type="url"
                  required
                  placeholder="https://..."
                  value={blockEmbedUrl}
                  onChange={(e) => setBlockEmbedUrl(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "video_image" && (
              <FormField label={t("dashboard.pages.links.blockForm.video.label")} hint={t("dashboard.pages.links.blockForm.videoImage.videoUrlHint")}>
                <input
                  type="url"
                  placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                  value={blockVideoImageVideoUrl}
                  onChange={(e) => setBlockVideoImageVideoUrl(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "embed_link" && (
              <div className="flex flex-col gap-2">
                <FormField label={t("dashboard.pages.links.blockForm.embedLink.urlLabel")}>
                  <input
                    type="url"
                    required
                    placeholder="https://..."
                    value={blockEmbedLinkUrl}
                    onChange={(e) => setBlockEmbedLinkUrl(e.target.value)}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.embedLink.descriptionLabel")}>
                  <RichTextEditor html={blockEmbedLinkDescription} onChange={setBlockEmbedLinkDescription} />
                </FormField>
              </div>
            )}
            {blockType === "list" && (
              <FormField label={t("dashboard.pages.links.blockForm.list.itemsLabel")}>
                <ListItemsEditor
                  style={blockListStyle}
                  items={blockListItems}
                  onUpdateStyle={setBlockListStyle}
                  onUpdateItems={(items) =>
                    setBlockListItems(items.map((it) => ({ title: it.title, description: it.description ?? "", author: it.author ?? "", url: it.url ?? "" })))
                  }
                />
              </FormField>
            )}
            {blockType === "video" && (
              <FormField label={t("dashboard.pages.links.blockForm.video.label")}>
                <input
                  type="url"
                  placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                  value={blockVideoUrl}
                  onChange={(e) => setBlockVideoUrl(e.target.value)}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "maps" && (
              <div className="flex flex-col gap-2">
                <FormField label={t("dashboard.pages.links.blockForm.maps.label")}>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder={t("dashboard.pages.links.blockForm.maps.placeholderAdd")}
                      value={blockMapsUrl}
                      onChange={(e) => setBlockMapsUrl(e.target.value)}
                      className="w-full min-w-0 flex-1 rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setMapsPickerOpenFor("add")}
                      className="flex-shrink-0 rounded-lg border-2 border-jeon-ink px-3 py-2 text-xs font-bold text-jeon-purple hover:border-jeon-purple"
                    >
                      {t("dashboard.pages.links.blockForm.maps.pickOnMap")}
                    </button>
                  </div>
                </FormField>
                <FormField label={t("dashboard.pages.links.blockForm.maps.behaviorLabel")}>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-start gap-2 text-xs text-app-ink">
                      <input
                        type="radio"
                        name="blockMapsEmbed"
                        checked={!blockMapsEmbed}
                        onChange={() => setBlockMapsEmbed(false)}
                        className="mt-0.5"
                      />
                      {t("dashboard.pages.links.blockForm.maps.openDirect")}
                    </label>
                    <label className="flex items-start gap-2 text-xs text-app-ink">
                      <input
                        type="radio"
                        name="blockMapsEmbed"
                        checked={blockMapsEmbed}
                        onChange={() => setBlockMapsEmbed(true)}
                        className="mt-0.5"
                      />
                      {t("dashboard.pages.links.blockForm.maps.embedInline")}
                    </label>
                  </div>
                </FormField>
              </div>
            )}
            {blockType === "faq" && (
              <div className="flex flex-col gap-2">
                {blockFaqItems.map((item, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-lg border border-app-border p-2.5">
                    <FormField label={t("dashboard.pages.links.blockForm.faq.questionLabel").replace("{n}", String(i + 1))}>
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.blockForm.faq.questionPlaceholder")}
                        value={item.question}
                        onChange={(e) => setBlockFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, question: e.target.value } : it)))}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.pages.links.blockForm.faq.answerLabel")}>
                      <RichTextEditor
                        html={item.answer}
                        onChange={(html) => setBlockFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, answer: html } : it)))}
                      />
                    </FormField>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBlockFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-bold text-jeon-purple hover:underline"
                >
                  {t("dashboard.pages.links.blockForm.faq.addQuestion")}
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddingBlock(false)}
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.links.common.cancel")}
              </button>
              <button type="submit" disabled={savingBlock} className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60">
                {savingBlock ? t("dashboard.pages.links.blockForm.creating") : t("dashboard.pages.links.blockForm.createBlock")}
              </button>
            </div>
          </form>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {links.map((link) => (
            <li
              key={link.id}
              draggable
              onDragStart={() => setDragId(link.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(link.id)}
              // Kulit kartu -- redesain baris blok 18 September 2026 (referensi
              // gambar dari pengguna, "seperti gambar ini lebih bagus"): kartu
              // putih bergaris 1px, radius besar, TANPA bayangan brutal
              // (tumpukan 10-20 kartu ber-shadow-card terasa berat), ikon
              // tile 48px, judul tebal + satu baris "n klik · domain", di
              // kanan hanya chevron/sakelar/menu ⋮. `group` dipakai anak-anak
              // header utk kontrol yang baru muncul saat hover (grip, pensil).
              className={`group flex flex-col gap-3 rounded-[22px] border border-app-border bg-app-surface p-3 transition-colors sm:p-4 ${link.is_active ? "" : "opacity-60"}`}
            >
              <div
                // onClick baris ini -- permintaan langsung pengguna, 17
                // September 2026 ("tanda panah > harusnya di blok nya
                // langsung jadi ketika blok di klik data nya keluar dan
                // bisa diedit"): SEBELUMNYA cuma tombol panah kecil (skrg
                // jadi span dekoratif, lihat di bawah) yang bisa
                // membuka/tutup accordion isi blok -- target klik sekecil
                // itu gampang meleset & terjepit di antara chip klik/tombol
                // Tools/Toggle. Sekarang SELURUH baris header (kecuali
                // kontrol urutan ▲▼/drag & tombol/sakelar di ujung kanan,
                // yang masing-masing sudah dipasang stopPropagation di
                // bawah) jadi satu target klik besar. Kondisi SAMA PERSIS
                // dgn yang menggerbang tampil/tidaknya panah di bawah --
                // block_type "link" & tipe tanpa isi (blockPreviewFor null)
                // sengaja tidak dapat cursor-pointer/onClick sama sekali,
                // tidak ada apa pun yang bisa dibuka utk keduanya.
                onClick={() => {
                  // SENGAJA bukan role="button"/tabIndex di <div> ini --
                  // tombol panah di bawah (masih <button> asli, sudah
                  // dipasang stopPropagation) TETAP satu-satunya jalur
                  // keyboard-accessible utk buka/tutup blok, supaya tidak
                  // membuat "interactive control bersarang" (div role=button
                  // yang di dalamnya ada <button> lain -- pelanggaran
                  // aksesibilitas nested-interactive). onClick baris ini
                  // MURNI perluasan target klik MOUSE, bukan pengganti.
                  // isBlockExpandable TIDAK dipakai lagi di sini -- SEMUA
                  // tipe blok sekarang bisa dibuka (permintaan langsung
                  // pengguna, 20 September 2026: strip alat kelola/Tools
                  // pindah ke panel ini, jadi bahkan tipe tanpa field
                  // konten sama sekali mis. "contact_form" tetap punya
                  // sesuatu utk ditampilkan di panelnya -- SEBELUMNYA tipe
                  // begitu cuma bisa diakses lewat tombol ⋮ terpisah yang
                  // kini sudah dihapus). Toko (ProdukPageEditor.tsx) TIDAK
                  // ikut berubah -- masih pakai isBlockExpandable lama, lihat
                  // catatan drift di project memory.
                  if (link.block_type === "catalog" || link.block_type === "faq") {
                    setDrilldownBlockId(link.id);
                  } else {
                    toggleContentEdit(link);
                  }
                }}
                className="relative flex cursor-pointer items-center gap-3"
              >
                {/* Grip drag -- redesain baris blok 18 September 2026: kolom
                    ▲/grip/▼ yang dulu selalu tampil di kiri DIHAPUS dari header
                    (referensi gambar pengguna: ikon rata kiri, tidak ada
                    kontrol di depannya). Kartu <li> tetap draggable; grip ini
                    murni afordans yang muncul saat hover, ditaruh absolut di
                    dalam padding kartu supaya tidak menggeser ikon. Tombol
                    ▲/▼ yang keyboard-accessible (§22 "drag alternative move
                    up/down") PINDAH ke BlockToolsStrip (menu ⋮) sebagai tombol
                    berlabel. */}
                <IconGripVertical className="absolute -left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 cursor-grab text-app-muted opacity-0 transition-opacity group-hover:opacity-60" />
                {/* Badge ikon -- permintaan langsung pengguna, 14 Agustus 2026:
                    "harusnya semua tipe ini... bisa ubah icon" -- urutan resolusi
                    SAMA PERSIS dgn tautan biasa (custom_icon_url > icon_key galeri
                    > deteksi platform dari URL [khusus tautan biasa] > ikon default
                    per block_type), berlaku utk SEMUA block_type. Ukuran tile
                    48px (redesain 18 September 2026): platform terdeteksi
                    memakai warna mereknya, selain itu tile putih bergaris
                    dengan glyph ikon -- persis referensi gambar pengguna. */}
                {link.custom_icon_url ? (
                  <Image
                    src={link.custom_icon_url}
                    alt=""
                    title={t("dashboard.pages.links.linkCard.customIcon")}
                    width={48}
                    height={48}
                    className="h-12 w-12 flex-shrink-0 rounded-2xl object-cover ring-1 ring-black/5"
                  />
                ) : link.icon_key && getLibraryIcon(link.icon_key) ? (
                  (() => {
                    const libraryIcon = getLibraryIcon(link.icon_key)!;
                    return (
                      <span title={libraryIcon.label} className={BLOCK_TILE_CLASS}>
                        <libraryIcon.Icon className="h-5 w-5" />
                      </span>
                    );
                  })()
                ) : link.block_type === "link" ? (
                  (() => {
                    const { Icon, label, badgeClass, isFallback } = detectLinkIcon(link.url);
                    return (
                      <span
                        title={label}
                        className={isFallback ? BLOCK_TILE_CLASS : `flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-black/5 ${badgeClass}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                    );
                  })()
                ) : (
                  (() => {
                    // Fallback WAJIB (lihat catatan di BLOCK_TYPE_ICON): tipe
                    // yang tidak ada di peta tidak boleh menjatuhkan halaman.
                    const DefaultIcon = BLOCK_TYPE_ICON[link.block_type] ?? IconGrid;
                    return (
                      <span title={blockTypeLabel[link.block_type] ?? link.block_type} className={BLOCK_TILE_CLASS}>
                        <DefaultIcon className="h-5 w-5" />
                      </span>
                    );
                  })()
                )}
                <div className="min-w-0 flex-1">
                  {editingField?.id === link.id && editingField.field === "title" ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => saveEditField(link)}
                      onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded-md border border-jeon-purple px-2 py-1 text-sm font-bold text-app-ink focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {/* Fallback label tipe blok -- permintaan langsung
                          pengguna, 19 September 2026 ("judul blok juga itu
                          optional untuk bisa ditampilkan"): judul sekarang
                          bisa dikosongkan (blok baru non-link/video/maps
                          TIDAK LAGI dipaksa terisi label generik, lihat
                          handleSelectContentTile) supaya di halaman publik
                          bisa benar-benar tidak menampilkan apa pun. Baris
                          daftar DASHBOARD ini tetap butuh SESUATU utk
                          diidentifikasi -- fallback ke nama tipe blok
                          (blockTypeLabel), TIDAK PERNAH dipakai di
                          rendering halaman publik, pola sama persis
                          blockDisplayLabel di BlockDrilldownEditor.tsx. */}
                      <p className="truncate text-[15px] font-bold leading-snug text-app-ink">{link.title || blockTypeLabel[link.block_type] || link.block_type}</p>
                      {/* Permintaan langsung pengguna, 14 Agustus 2026: "judul nya
                          bisa diedit juga sama seperti yang lain" -- sebelumnya
                          cuma tautan biasa yang bisa ubah judul inline, sekarang
                          berlaku utk SEMUA block_type (updateLink sudah generik).
                          Pensil baru tampak saat hover kartu/fokus (redesain 18
                          September 2026 -- ikon edit permanen di tiap judul
                          cuma jadi noise, temuan audit baris blok). */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditField(link, "title");
                        }}
                        className="flex-shrink-0 p-1 text-app-muted opacity-0 transition-opacity hover:text-jeon-purple focus:opacity-100 group-hover:opacity-100"
                        title={t("dashboard.pages.links.linkCard.editTitle")}
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Baris ringkasan -- redesain "Konsisten & Ringkas" (14
                      September 2026, lihat catatan lengkap di
                      blockPreviewFor): info penting blok (jumlah produk/
                      foto/pertanyaan, cuplikan teks, dst.) langsung
                      terlihat TANPA perlu membuka accordion-nya -- dulu
                      SEBAGIAN blok (produk/galeri) harus terbuka dulu utk
                      tahu isinya, SEBAGIAN lain (text/faq) malah harus
                      klik "Edit Konten" dulu. "link" (tautan klasik)
                      SENGAJA dilewati -- sudah punya field URL inline yang
                      selalu terlihat sendiri, tidak perlu baris ringkasan
                      tambahan. */}
                  {/* Redesain 18 September 2026 (referensi gambar pengguna):
                      subjudul = "n klik · domain" utk tautan (URL penuh &
                      deskripsi baru tampil saat baris dibuka), "n klik ·
                      ringkasan" utk tipe lain; klik hanya utk tipe yang
                      memang diklik (showsClickCount) -- menggantikan chip
                      "📊 n" yang dulu tampil di semua baris. Tiap bagian
                      dirender sebagai <span> terpisah supaya tetap bisa
                      dicari sbg teks utuh (e2e quick-setup.spec.ts mencari
                      domain tautan per baris). */}
                  {(() => {
                    const parts: string[] = [];
                    if (showsClickCount(link)) {
                      parts.push(t("dashboard.pages.links.linkCard.clicksCount").replace("{n}", link.click_count.toLocaleString("id-ID")));
                    }
                    if (link.block_type === "link") {
                      const host = linkHostname(link.url);
                      if (host) parts.push(host);
                    } else if (contentEditId !== link.id) {
                      const preview = blockPreviewFor(link, t);
                      if (preview) parts.push(preview);
                    }
                    if (parts.length === 0) return null;
                    return (
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-app-muted">
                        {parts.flatMap((part, i) => [
                          i > 0 ? (
                            <span key={`sep-${i}`} aria-hidden className="opacity-50">
                              ·
                            </span>
                          ) : null,
                          <span key={`part-${i}`} className={i === parts.length - 1 ? "truncate" : "flex-shrink-0 tabular-nums"}>
                            {part}
                          </span>,
                        ])}
                      </p>
                    );
                  })()}
                </div>
                {/* Chip jumlah klik -- pindah dari footer kartu ke baris
                    header (restrukturisasi UX 31 Agustus 2026): informasi
                    ringkas tak layak memboroskan satu baris penuh sendiri. */}
                {/* Tombol buka/tutup isi blok -- redesain "Konsisten &
                    Ringkas" (14 September 2026, Opsi A dari 3 usulan
                    redesain yang disetujui pengguna lewat artifact):
                    SEBELUMNYA tombol ini ("Edit Konten", teks polos) HANYA
                    muncul utk 10 tipe blok tertentu -- tipe lain (produk/
                    galeri/audio/file/list/gambar) selalu menampilkan
                    isinya di bawah TANPA toggle sama sekali, blok lain lagi
                    (teks/FAQ) baru terbuka setelah tombol ini diklik --
                    tidak konsisten. Sekarang SATU pola accordion utk semua
                    tipe yang punya isi (blockPreviewFor !== null). Panel
                    isi blok di bawah (untuk tipe SELAIN 10 yang tadinya
                    "Edit Konten"-gated) SEKARANG JUGA digerbang
                    `contentEditId === link.id`. Sejak redesain 18 September
                    2026 "link" IKUT expandable (isBlockExpandable) -- yang
                    dibuka adalah baris URL & deskripsinya; judulnya SENGAJA
                    beda dari "Edit Konten" (editLinkDetails) supaya
                    pencarian by-name "Edit Konten" di e2e (accordion/faq/
                    catalog spec, level halaman) tetap cocok tepat satu
                    tombol. Nama tombol konstan per tipe, status buka/tutup
                    lewat aria-expanded (jangan diubah jadi dinamis, pernah
                    merusak 4 test). Gerbang isBlockExpandable DIHAPUS 20
                    September 2026 -- lihat catatan lengkap di onClick baris
                    header di atas, SEMUA tipe blok sekarang expandable. */}
                <button
                  type="button"
                  onClick={(e) => {
                      // stopPropagation WAJIB -- tombol ini sekarang ANAK
                      // dari baris header yang juga onClick (lihat catatan
                      // di atas), tanpa ini klik di sini akan memicu toggle
                      // DUA KALI (dari sini + dari bubble ke induk) yang
                      // saling membatalkan (buka lalu langsung tutup lagi).
                      e.stopPropagation();
                      if (link.block_type === "catalog" || link.block_type === "faq") {
                        setDrilldownBlockId(link.id);
                      } else {
                        toggleContentEdit(link);
                      }
                    }}
                    aria-expanded={contentEditId === link.id}
                    title={link.block_type === "link" ? t("dashboard.pages.links.linkCard.editLinkDetails") : t("dashboard.pages.links.linkCard.editContent")}
                    // hidden sm:flex -- di ponsel seluruh baris sudah jadi
                    // target tap utk buka/tutup isi; chevron 36px ini cuma
                    // memakan lebar yang seharusnya utk judul.
                    className={`hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors sm:flex ${
                      contentEditId === link.id ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-muted hover:bg-app-surface-2 hover:text-app-ink"
                    }`}
                  >
                    <IconChevronRight className={`h-4 w-4 transition-transform ${contentEditId === link.id ? "rotate-90" : ""}`} />
                  </button>
                {/* Wrapper stopPropagation -- Toggle sendiri (Toggle.tsx)
                    dipakai luas di banyak tempat lain yang tidak bersarang
                    dlm baris yang klik-able, jadi stopPropagation ditaruh
                    di sini (scoped ke pemakaian ini saja), bukan diubah di
                    komponen bersama itu sendiri. */}
                <div onClick={(e) => e.stopPropagation()}>
                  <Toggle checked={link.is_active} onChange={() => handleToggleActive(link)} label={t("dashboard.pages.links.linkCard.activateLabel").replace("{title}", link.title)} />
                </div>
              </div>

              {/* Baris URL -- utk "link" baru tampil saat baris dibuka
                  (redesain 18 September 2026, subjudul header sudah
                  menampilkan domainnya); "image" tetap selalu tampil karena
                  tautan tujuannya opsional & butuh ajakan "tambah link". */}
              {link.block_type === "image" && (
                <div className="sm:ml-[60px] flex items-center gap-1.5">
                  {editingField?.id === link.id && editingField.field === "url" ? (
                    <input
                      type="url"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => saveEditField(link)}
                      onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                      placeholder={t("dashboard.pages.links.linkCard.imageLinkPlaceholder")}
                      className="w-full rounded-md border border-jeon-purple px-2 py-1 text-xs text-app-muted focus:outline-none"
                    />
                  ) : link.url ? (
                    <>
                      <p className="truncate text-xs text-app-muted">{link.url}</p>
                      <button type="button" onClick={() => startEditField(link, "url")} className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.linkCard.editUrl")}>
                        <IconPencil className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    // "image" -- link tujuan OPSIONAL (beda dari "link" yang
                    // urlnya wajib & selalu ada), tampilkan ajakan tambah
                    // alih-alih baris kosong.
                    <button type="button" onClick={() => startEditField(link, "url")} className="text-[11px] font-semibold text-jeon-purple hover:underline">
                      {t("dashboard.pages.links.linkCard.addImageLink")}
                    </button>
                  )}
                </div>
              )}

              {/* Statistik klik pindah jadi chip ringkas di baris header
                  kartu (restrukturisasi UX 31 Agustus 2026) -- footer
                  terpisah yang lama memboroskan satu baris penuh per kartu. */}
            </li>
          ))}
          {links.length === 0 && <EmptyState as="li" text={t("dashboard.pages.links.emptyState")} />}
        </ul>

      </div>

      {/* Editor blok -- permintaan langsung pengguna, 19 September 2026
          ("bukan buka halaman penuh tapi ketika klik blok berganti isi
          blok nya seperti referensi linktree"): pola SAMA PERSIS
          drilldownBlock di bawah -- menggantikan isi kolom kiri, kolom
          Pratinjau Langsung (kanan) tetap terlihat. IIFE + `const link =
          contentEditingLink` supaya seluruh JSX di bawah (dipindah apa
          adanya dari accordion inline lama) tidak perlu diubah satu per
          satu -- semuanya masih merujuk `link` seperti sebelumnya. */}
      {contentEditingLink && (() => {
        const link = contentEditingLink;
        // index -- dibutuhkan BlockToolsStrip (Naik/Turun) sekarang blok
        // itu pindah ke sini (di luar `.map()` daftar blok, jadi `index`
        // loop lama tidak tersedia lagi) -- permintaan langsung pengguna,
        // 20 September 2026: "untuk semua options seperti ganti icon dll
        // di setiap blok itu di pindahkan saja saat setelah klik blok
        // nya... sesuaikan lagi isi tiap blok nya setelah blok di klik
        // tambah selengkap mungkin yang akan dibutuhkan user".
        const index = links.findIndex((l) => l.id === link.id);
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setContentEditId(null)}
                className="flex flex-shrink-0 items-center gap-1 rounded-full border-2 border-[#111111] bg-jeon-lavender px-3 py-1.5 text-xs font-bold text-[#111111] transition-transform hover:-translate-x-0.5"
              >
                <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
                {t("dashboard.pages.links.contentEditorPage.back")}
              </button>
              <h2 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-app-ink">
                {link.title || blockTypeLabel[link.block_type] || link.block_type}
              </h2>
            </div>
            <div className="flex flex-col gap-4 rounded-jmd border border-app-border bg-app-surface p-4 shadow-card">
                      {link.block_type === "link" && (
                        <div className="flex items-center gap-1.5">
                          {editingField?.id === link.id && editingField.field === "url" ? (
                            <input
                              type="url"
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => saveEditField(link)}
                              onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                              className="w-full rounded-md border border-jeon-purple px-2.5 py-2 text-sm text-app-ink focus:outline-none"
                            />
                          ) : (
                            <>
                              <p className="min-w-0 flex-1 truncate rounded-md border border-app-border px-2.5 py-2 text-sm text-app-muted">{link.url}</p>
                              <button type="button" onClick={() => startEditField(link, "url")} className="flex-shrink-0 p-1.5 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.linkCard.editUrl")}>
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {link.block_type === "link" && (
                        <div className="flex items-center gap-1.5">
                          {editingField?.id === link.id && editingField.field === "description" ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => saveEditField(link)}
                              onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                              maxLength={240}
                              placeholder={t("dashboard.pages.links.linkCard.descriptionPlaceholder")}
                              className="w-full rounded-md border border-jeon-purple px-2.5 py-2 text-sm text-app-muted focus:outline-none"
                            />
                          ) : (
                            <>
                              <p className="min-w-0 flex-1 truncate rounded-md border border-app-border px-2.5 py-2 text-sm italic text-app-muted">
                                {link.description || t("dashboard.pages.links.linkCard.noDescription")}
                              </p>
                              <button
                                type="button"
                                onClick={() => startEditField(link, "description")}
                                className="flex-shrink-0 p-1.5 text-app-muted hover:text-jeon-purple"
                                title={t("dashboard.pages.links.linkCard.editDescription")}
                              >
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {link.block_type === "link" && (
                        <LinkDisplayModePicker
                          active={Boolean(link.is_featured)}
                          onSelect={(featured) => {
                            // handleToggleFeatured MEMBALIK status saat ini (dipakai
                            // jg oleh BlockToolsStrip lama) -- picker ini kirim status
                            // TUJUAN eksplisit (klik "Classic"=false/"Featured"=true),
                            // jadi cuma panggil toggle kalau memang beda dari sekarang
                            // (klik kotak yang sudah aktif = no-op, bukan flip terbalik).
                            if (featured !== Boolean(link.is_featured)) handleToggleFeatured(link);
                          }}
                        />
                      )}
              {link.block_type === "link" && link.is_featured && (
                <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  {link.thumbnail_url ? (
                    // Ukuran TETAP 96x56 (w-24 h-14). thumbnail_url bisa berupa
                    // URL img.youtube.com yang diturunkan otomatis backend untuk
                    // tautan YouTube ber-"featured" (links.go) -- host itu sudah
                    // didaftarkan di images.remotePatterns (next.config.js).
                    <Image src={link.thumbnail_url} alt="" width={96} height={56} className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
                  ) : (
                    <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">
                      {t("dashboard.pages.links.common.noneYet")}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[11px] text-app-muted">
                      {link.thumbnail_url
                        ? t("dashboard.pages.links.featuredPanel.hasThumbnail")
                        : t("dashboard.pages.links.featuredPanel.noThumbnail")}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                        {thumbnailUploadingId === link.id ? t("dashboard.pages.links.common.uploading") : link.thumbnail_url ? t("dashboard.pages.links.featuredPanel.changeThumbnail") : t("dashboard.pages.links.featuredPanel.uploadThumbnail")}
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={(e) => handleThumbnailUpload(e, link)}
                          disabled={thumbnailUploadingId === link.id}
                          className="hidden"
                        />
                      </label>
                      {link.thumbnail_url && (
                        <button
                          type="button"
                          onClick={() => handleRemoveThumbnail(link)}
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                        >
                          {t("dashboard.pages.links.common.delete")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Strip alat kelola -- jadwal/kunci/sensitif/kontrol ikon/
                  duplikat/hapus/urutan. PINDAH ke sini (sebelumnya accordion
                  inline terpisah di balik tombol ⋮ di baris kompak) --
                  permintaan langsung pengguna, 20 September 2026: "untuk
                  semua options seperti ganti icon dll di setiap blok itu di
                  pindahkan saja saat setelah blok di klik... tambah
                  selengkap mungkin yang akan dibutuhkan user". Selalu
                  tampil (tanpa toggle ⋮ terpisah lagi) -- membuka blok ini
                  sendiri SUDAH jadi gerbangnya, konsisten dgn semangat
                  referensi Linktree (satu halaman/panel berisi semua
                  pengaturan blok, bukan tersebar di banyak tombol). */}
              <BlockToolsStrip
                link={link}
                iconUploading={iconUploadingId === link.id}
                onMoveUp={() => moveLinkByOffset(index, -1)}
                onMoveDown={() => moveLinkByOffset(index, 1)}
                canMoveUp={index > 0}
                canMoveDown={index < links.length - 1}
                onSchedule={() => openScheduleForm(link)}
                onLock={() => openLockForm(link)}
                onToggleSensitive={() => handleToggleSensitive(link)}
                onIconUpload={(e) => handleIconUpload(e, link)}
                onOpenIconGallery={() => setIconPickerLinkId(link.id)}
                onIconColorChange={(color) => handleIconColorChange(link, color)}
                onClearIconColor={() => handleClearIconColor(link)}
                onRemoveIcon={() => handleRemoveIcon(link)}
                onToggleFeatured={() => handleToggleFeatured(link)}
                hideFeaturedToggle
                onDuplicate={() => handleDuplicate(link)}
                onDelete={() => setConfirmDeleteId(link.id)}
              />

              {/* Panel "Kelola foto" -- blok "gallery" (hasil analisa galeri
                  tema kompetitor, 17 Agustus 2026). SEBELUMNYA selalu
                  tampil unconditional -- redesain "Konsisten & Ringkas" (14
                  September 2026) menggerbangnya sama seperti tipe lain di
                  belakang `contentEditId === link.id`, dipicu tombol
                  chevron accordion yang sekarang SERAGAM utk semua tipe
                  blok, bukan lagi campuran "selalu terbuka"/"Edit Konten"
                  (lihat blockPreviewFor & baris ringkasan di header). */}
              {/* image_slider -- alias tervalidasi "gallery" di backend
                  (gallery/image_slider berbagi SATU case validasi persis
                  sama, links.go) -- REUSE PERSIS panel ini, endpoint upload/
                  hapus SAMA (uploadGalleryImage/deleteGalleryImage tidak
                  peduli block_type), tidak ada kode baru yang perlu ditulis. */}
              {(link.block_type === "gallery" || link.block_type === "image_slider") && contentEditId === link.id && (
                <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-app-muted">
                      {(((link.block_data?.images as string[]) ?? []).length)}/{maxGalleryImages} {t("dashboard.pages.links.galleryPanel.photoCountSuffix")}
                    </p>
                    {/* Tampilan Grid/Tumpukan -- permintaan langsung pengguna,
                        18 September 2026 (blok kartu tumpukan foto -> popup
                        foto + keterangan), lihat GalleryBlock.tsx. Khusus
                        "gallery" -- image_slider punya render sendiri. */}
                  </div>
                  {/* Pemilih tampilan -- komponen bersama GalleryDisplayPicker
                      (6 tampilan sejak 18 September 2026, lihat
                      lib/gallery-display.ts). Khusus "gallery" -- image_slider
                      punya render sendiri. */}
                  {link.block_type === "gallery" && (
                    <GalleryDisplayPicker value={normalizeGalleryDisplay(link.block_data?.display)} onChange={(display) => handleBlockDataPatch(link, { display })} />
                  )}
                  {/* Daftar foto + judul/keterangan per foto (captions dikunci
                      per URL, lihat validateBlockDataAtDepth links.go) --
                      disimpan onBlur lewat handleBlockDataPatch. */}
                  {((link.block_data?.images as string[]) ?? []).length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {((link.block_data?.images as string[]) ?? []).map((src, i) => {
                        const captions = (link.block_data?.captions as Record<string, { title?: string; description?: string }> | undefined) ?? {};
                        const cap = captions[src] ?? {};
                        const saveCaption = (field: "title" | "description", value: string) => {
                          const next = { ...captions, [src]: { ...cap, [field]: value.trim() } };
                          if ((cap[field] ?? "") === value.trim()) return;
                          handleBlockDataPatch(link, { captions: next });
                        };
                        return (
                          <div key={src} className="flex items-start gap-2 rounded-md border border-app-border bg-app-surface p-1.5">
                            {/* Ukuran TETAP 48px -- thumbnail baris caption h-12 w-12. */}
                            <Image src={src} alt="" width={48} height={48} className="h-12 w-12 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                              <input
                                type="text"
                                maxLength={120}
                                defaultValue={cap.title ?? ""}
                                onBlur={(e) => saveCaption("title", e.target.value)}
                                placeholder={t("dashboard.pages.links.galleryPanel.captionTitlePlaceholder")}
                                className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                              />
                              <input
                                type="text"
                                maxLength={500}
                                defaultValue={cap.description ?? ""}
                                onBlur={(e) => saveCaption("description", e.target.value)}
                                placeholder={t("dashboard.pages.links.galleryPanel.captionDescPlaceholder")}
                                className="w-full rounded-md border border-app-border bg-app-surface px-2 py-1 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleGalleryImageDelete(link, i)}
                              title={t("dashboard.pages.links.galleryPanel.deletePhoto")}
                              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-app-muted hover:bg-red-50 hover:text-red-600"
                            >
                              <IconX className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(((link.block_data?.images as string[]) ?? []).length) < maxGalleryImages && (
                      <label
                        className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
                          galleryUploadingId === link.id ? "opacity-60" : ""
                        }`}
                      >
                        {galleryUploadingId === link.id ? (
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                        ) : (
                          <>
                            <IconPlus className="h-4 w-4" />
                            <span className="text-[9px] font-semibold">{t("dashboard.pages.links.quickAdd.addButton")}</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={(e) => handleGalleryImageUpload(e, link)}
                          disabled={galleryUploadingId === link.id}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Panel "Kelola gambar" -- blok "project_showcase" (permintaan
                  langsung pengguna, 24 Agustus 2026: kartu "Project
                  Unggulan"), pola sama seperti panel Featured Link (satu
                  gambar, unggah ulang menimpa) -- BEDA disimpan di
                  block_data.image_url, bukan kolom thumbnail_url. */}
              {link.block_type === "project_showcase" && contentEditId === link.id && (
                <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  {link.block_data?.image_url ? (
                    // Ukuran TETAP 96x56 (w-24 h-14) -- kotak pratinjau, bukan
                    // rasio gambar aslinya (object-cover memotong, sama seperti
                    // sebelumnya).
                    <Image
                      src={link.block_data.image_url as string}
                      alt=""
                      width={96}
                      height={56}
                      className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">
                      {t("dashboard.pages.links.common.noneYet")}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[11px] text-app-muted">{t("dashboard.pages.links.showcasePanel.imageHint")}</p>
                    <label className="w-fit cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                      {showcaseUploadingId === link.id ? t("dashboard.pages.links.common.uploading") : link.block_data?.image_url ? t("dashboard.pages.links.showcasePanel.changeImage") : t("dashboard.pages.links.showcasePanel.uploadImage")}
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={(e) => handleShowcaseImageUpload(e, link)}
                        disabled={showcaseUploadingId === link.id}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Panel "Kelola audio" -- blok "audio", pola sama seperti
                  panel Kelola foto di atas. Cover art dikelola lewat tombol
                  ikon kustom yang sudah generik (baris kontrol ikon di
                  atas), tidak diduplikasi di sini. */}
              {link.block_type === "audio" && contentEditId === link.id && (
                <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-app-surface text-jeon-purple ring-1 ring-black/5">
                    <IconMusicNote className="h-5 w-5" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[11px] text-app-muted">
                      {(link.block_data?.audio_url as string)
                        ? t("dashboard.pages.links.audioPanel.hasAudio")
                        : t("dashboard.pages.links.audioPanel.noAudio")}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                        {audioUploadingId === link.id ? t("dashboard.pages.links.common.uploading") : (link.block_data?.audio_url as string) ? t("dashboard.pages.links.audioPanel.changeAudio") : t("dashboard.pages.links.audioPanel.uploadAudio")}
                        <input
                          type="file"
                          accept=".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                          onChange={(e) => handleAudioUpload(e, link)}
                          disabled={audioUploadingId === link.id}
                          className="hidden"
                        />
                      </label>
                      {(link.block_data?.audio_url as string) && (
                        <button
                          type="button"
                          onClick={() => handleAudioDelete(link)}
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                        >
                          {t("dashboard.pages.links.common.delete")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Panel "Kelola file" -- blok "file" (permintaan langsung
                  pengguna, 20 Agustus 2026: "tambahkan file pdf download"),
                  pola sama persis seperti panel Kelola audio di atas. */}
              {link.block_type === "file" && contentEditId === link.id && (
                <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-app-surface text-jeon-purple ring-1 ring-black/5">
                    <IconFileText className="h-5 w-5" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="truncate text-[11px] text-app-muted">
                      {(link.block_data?.file_url as string)
                        ? t("dashboard.pages.links.filePanel.hasFile").replace("{name}", (link.block_data?.file_name as string) ?? t("dashboard.pages.links.filePanel.fallbackFileName"))
                        : t("dashboard.pages.links.filePanel.noFile")}
                    </p>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                        {fileUploadingId === link.id ? t("dashboard.pages.links.common.uploading") : (link.block_data?.file_url as string) ? t("dashboard.pages.links.filePanel.changeFile") : t("dashboard.pages.links.filePanel.uploadFile")}
                        <input
                          type="file"
                          accept=".pdf,.zip,.epub,application/pdf,application/zip,application/epub+zip"
                          onChange={(e) => handleFileUpload(e, link)}
                          disabled={fileUploadingId === link.id}
                          className="hidden"
                        />
                      </label>
                      {(link.block_data?.file_url as string) && (
                        <button
                          type="button"
                          onClick={() => handleFileDelete(link)}
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                        >
                          {t("dashboard.pages.links.common.delete")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Panel "Kelola Gambar" -- blok "image"/"video_image"/
                  "embed_link" ("full parity" mode Builder, 12 September
                  2026), SATU panel dipakai bersama ketiganya, pola sama
                  persis panel "Kelola gambar" project_showcase di atas
                  (satu gambar, unggah ulang menimpa) TAPI pakai
                  uploadBuilderMediaImage/deleteBuilderMediaImage -- endpoint
                  INI yang memang didesain generik lintas 3 tipe ini (lihat
                  mediaImageBlockTypes, links.go). */}
              {(link.block_type === "image" || link.block_type === "video_image" || link.block_type === "embed_link") && contentEditId === link.id && (
                <div className="sm:ml-[60px] flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  {link.block_data?.image_url ? (
                    // Ukuran TETAP 96x56 (w-24 h-14) -- kotak pratinjau, bukan
                    // rasio gambar aslinya (object-cover memotong, sama seperti
                    // sebelumnya).
                    <Image
                      src={link.block_data.image_url as string}
                      alt=""
                      width={96}
                      height={56}
                      className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-app-border text-[10px] text-app-muted">
                      {t("dashboard.pages.links.common.noneYet")}
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-[11px] text-app-muted">{t("dashboard.pages.links.mediaImagePanel.imageHint")}</p>
                    <div className="flex items-center gap-2">
                      <label className="w-fit cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
                        {mediaImageUploadingId === link.id ? t("dashboard.pages.links.common.uploading") : link.block_data?.image_url ? t("dashboard.pages.links.showcasePanel.changeImage") : t("dashboard.pages.links.showcasePanel.uploadImage")}
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                          onChange={(e) => handleMediaImageUpload(e, link)}
                          disabled={mediaImageUploadingId === link.id}
                          className="hidden"
                        />
                      </label>
                      {Boolean(link.block_data?.image_url) && (
                        <button
                          type="button"
                          onClick={() => handleMediaImageDelete(link)}
                          className="text-[11px] font-semibold text-red-600 hover:underline"
                        >
                          {t("dashboard.pages.links.common.delete")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Panel "Kelola Item" -- blok "list" ("full parity" mode
                  Builder) -- ListItemsEditor sama persis yang dipakai di
                  form "Tambah Blok" (lihat di atas), autosave onBlur per
                  field lewat handleBlockDataPatch (validasi backend "list"
                  longgar, item boleh berubah bertahap tanpa tombol Simpan
                  eksplisit, beda dari FAQ top-level). */}
              {link.block_type === "list" && contentEditId === link.id && (
                <div className="sm:ml-[60px] rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <ListItemsEditor
                    style={(link.block_data?.style as "list" | "card" | "testimony" | undefined) ?? "list"}
                    items={(link.block_data?.items as ListEditorItem[] | undefined) ?? []}
                    onUpdateStyle={(style) => handleBlockDataPatch(link, { style })}
                    onUpdateItems={(items) => handleListItemsPatch(link, items)}
                  />
                </div>
              )}

              {/* Panel "Kelola Produk" -- blok "produk" ("full parity" mode
                  Builder) -- ProdukBlockEditor sama persis yang dipakai di
                  panel Builder (BuilderLeftPanel.tsx), `products`/
                  `setProducts` SUDAH ADA di halaman ini (di-fetch sekali di
                  awal, dipakai LivePreviewPanel juga). */}
              {link.block_type === "produk" && contentEditId === link.id && (
                <div className="sm:ml-[60px] rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <ProdukBlockEditor
                    blockData={link.block_data}
                    products={products}
                    onToggleProduct={(productId) => {
                      const current = ((link.block_data?.product_ids as string[] | undefined) ?? []);
                      const next = current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId];
                      handleBlockDataPatch(link, { product_ids: next });
                    }}
                    onProductCreated={(product) => {
                      setProducts((prev) => [...prev, product]);
                      const current = ((link.block_data?.product_ids as string[] | undefined) ?? []);
                      handleBlockDataPatch(link, { product_ids: [...current, product.id] });
                    }}
                    onLayoutChange={(layout) => handleBlockDataPatch(link, { layout })}
                    onShowCategoryFilterChange={(show) => handleBlockDataPatch(link, { show_category_filter: show })}
                  />
                </div>
              )}

              {(scheduleEditId === link.id ? (
                  <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                    <div className="flex gap-1.5">
                      <FormField label={t("dashboard.pages.links.schedulePanel.startLabel")}>
                        <input
                          type="datetime-local"
                          value={scheduleStart}
                          onChange={(e) => setScheduleStart(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.schedulePanel.endLabel")}>
                        <input
                          type="datetime-local"
                          value={scheduleEnd}
                          onChange={(e) => setScheduleEnd(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setScheduleEditId(null)}
                        className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted"
                      >
                        {t("dashboard.pages.links.common.cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={savingSchedule}
                        onClick={() => handleSaveSchedule(link)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingSchedule ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  link.starts_at &&
                  link.ends_at && (
                    <div className="sm:ml-[60px] flex items-center justify-between rounded-lg bg-jeon-warning/15 px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-jeon-warning">
                        {t("dashboard.pages.links.schedulePanel.scheduledLabel")} {new Date(link.starts_at).toLocaleString("id-ID")} {t("dashboard.pages.links.schedulePanel.until")} {new Date(link.ends_at).toLocaleString("id-ID")}
                      </span>
                      <button type="button" onClick={() => handleClearSchedule(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                        {t("dashboard.pages.links.schedulePanel.cancelSchedule")}
                      </button>
                    </div>
                  )
                ))}


              {(link.block_type === "link" || link.block_type === "button") &&
                (lockEditId === link.id ? (
                  <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                    <select
                      value={lockTypeInput}
                      onChange={(e) => setLockTypeInput(e.target.value as "age" | "code" | "subscribe" | "sensitive")}
                      className="bg-app-surface text-app-ink w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                    >
                      <option value="code">{t("dashboard.pages.links.lockPanel.types.code")}</option>
                      <option value="age">{t("dashboard.pages.links.lockPanel.types.age")}</option>
                      <option value="subscribe">{t("dashboard.pages.links.lockPanel.types.subscribe")}</option>
                      <option value="sensitive">{t("dashboard.pages.links.lockPanel.types.sensitive")}</option>
                    </select>
                    {lockTypeInput === "code" && (
                      <input
                        type="text"
                        placeholder={t("dashboard.pages.links.lockPanel.codePlaceholder")}
                        value={lockCodeInput}
                        onChange={(e) => setLockCodeInput(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    )}
                    {lockTypeInput === "age" && (
                      <input
                        type="number"
                        min={13}
                        max={99}
                        placeholder={t("dashboard.pages.links.lockPanel.minAgePlaceholder")}
                        value={lockMinAgeInput}
                        onChange={(e) => setLockMinAgeInput(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    )}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLockEditId(null)}
                        className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted"
                      >
                        {t("dashboard.pages.links.common.cancel")}
                      </button>
                      <button
                        type="button"
                        disabled={savingLock}
                        onClick={() => handleSaveLock(link)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingLock ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                      </button>
                    </div>
                  </div>
                ) : (
                  link.lock_type && (
                    <div className="sm:ml-[60px] flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-jeon-purple">
                        {t("dashboard.pages.links.lockPanel.lockedLabel")}{" "}
                        {link.lock_type === "code"
                          ? t("dashboard.pages.links.lockPanel.statusTypes.code")
                          : link.lock_type === "age"
                          ? t("dashboard.pages.links.lockPanel.statusTypes.age").replace("{age}", String(link.lock_min_age ?? 18))
                          : link.lock_type === "sensitive"
                          ? t("dashboard.pages.links.lockPanel.statusTypes.sensitive")
                          : t("dashboard.pages.links.lockPanel.statusTypes.subscribe")}
                      </span>
                      <button type="button" onClick={() => handleClearLock(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                        {t("dashboard.pages.links.lockPanel.unlock")}
                      </button>
                    </div>
                  )
                ))}

              {(link.block_type === "video" ||
                link.block_type === "maps" ||
                link.block_type === "text" ||
                link.block_type === "accordion" ||
                link.block_type === "project_showcase" ||
                // 9 tipe blok "full parity" -- lihat catatan lengkap di
                // trigger tombol "Edit isi" di atas.
                link.block_type === "button" ||
                link.block_type === "countdown" ||
                link.block_type === "embed" ||
                link.block_type === "video_image" ||
                link.block_type === "embed_link") &&
                contentEditId === link.id && (
                <div className="sm:ml-[60px] flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-jeon-purple">{t("dashboard.pages.links.contentEdit.editingLabel")}: {blockTypeLabel[link.block_type]}</p>
                  {link.block_type === "video" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.video.label")}>
                      <input
                        type="url"
                        placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                        value={editVideoUrl}
                        onChange={(e) => setEditVideoUrl(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  ) : link.block_type === "text" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.text.label")}>
                      <RichTextEditor html={editText} onChange={setEditText} />
                    </FormField>
                  ) : link.block_type === "accordion" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.accordion.label")}>
                      <RichTextEditor html={editAccordionText} onChange={setEditAccordionText} />
                    </FormField>
                  ) : link.block_type === "button" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-1.5">
                        {(["url", "whatsapp"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setEditButtonMode(mode)}
                            className={`flex-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                              editButtonMode === mode ? "bg-jeon-sidebar text-white" : "bg-gray-100 text-app-muted hover:bg-gray-200"
                            }`}
                          >
                            {mode === "url" ? t("dashboard.pages.links.blockForm.button.modeUrl") : t("dashboard.pages.links.blockForm.button.modeWhatsapp")}
                          </button>
                        ))}
                      </div>
                      {editButtonMode === "whatsapp" ? (
                        <>
                          <FormField label={t("dashboard.pages.links.blockForm.button.whatsappNumberLabel")}>
                            <input
                              type="tel"
                              placeholder={t("dashboard.pages.links.blockForm.button.whatsappNumberPlaceholder")}
                              value={editButtonWhatsappNumber}
                              onChange={(e) => setEditButtonWhatsappNumber(e.target.value)}
                              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                            />
                          </FormField>
                          <FormField label={t("dashboard.pages.links.blockForm.button.whatsappMessageLabel")}>
                            <textarea
                              placeholder={t("dashboard.pages.links.blockForm.button.whatsappMessagePlaceholder")}
                              value={editButtonWhatsappMessage}
                              onChange={(e) => setEditButtonWhatsappMessage(e.target.value)}
                              rows={2}
                              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                            />
                          </FormField>
                        </>
                      ) : (
                        <FormField label={t("dashboard.pages.links.blockForm.button.urlLabel")}>
                          <input
                            type="url"
                            placeholder="https://..."
                            value={editButtonUrl}
                            onChange={(e) => setEditButtonUrl(e.target.value)}
                            className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                        </FormField>
                      )}
                    </div>
                  ) : link.block_type === "countdown" ? (
                    <div className="flex flex-col gap-2">
                      <FormField label={t("dashboard.pages.links.blockForm.countdown.targetLabel")}>
                        <input
                          type="datetime-local"
                          value={editCountdownTargetAt}
                          onChange={(e) => setEditCountdownTargetAt(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.countdown.productLabel")} hint={t("dashboard.pages.links.blockForm.countdown.productHint")}>
                        <select
                          value={editCountdownProductId}
                          onChange={(e) => setEditCountdownProductId(e.target.value)}
                          className="bg-app-surface text-app-ink w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        >
                          <option value="">{t("dashboard.pages.links.blockForm.countdown.noProduct")}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      {!editCountdownProductId && (
                        <>
                          <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaLabelLabel")}>
                            <input
                              type="text"
                              placeholder={t("dashboard.pages.links.blockForm.countdown.ctaLabelPlaceholder")}
                              value={editCountdownCtaLabel}
                              onChange={(e) => setEditCountdownCtaLabel(e.target.value)}
                              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                            />
                          </FormField>
                          <FormField label={t("dashboard.pages.links.blockForm.countdown.ctaUrlLabel")}>
                            <input
                              type="url"
                              placeholder="https://..."
                              value={editCountdownCtaUrl}
                              onChange={(e) => setEditCountdownCtaUrl(e.target.value)}
                              className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                            />
                          </FormField>
                        </>
                      )}
                    </div>
                  ) : link.block_type === "embed" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.embed.urlLabel")} hint={t("dashboard.pages.links.blockForm.embed.urlHint")}>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={editEmbedUrl}
                        onChange={(e) => setEditEmbedUrl(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  ) : link.block_type === "video_image" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.video.label")} hint={t("dashboard.pages.links.blockForm.videoImage.videoUrlHint")}>
                      <input
                        type="url"
                        placeholder={t("dashboard.pages.links.blockForm.video.placeholder")}
                        value={editVideoImageVideoUrl}
                        onChange={(e) => setEditVideoImageVideoUrl(e.target.value)}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  ) : link.block_type === "embed_link" ? (
                    <div className="flex flex-col gap-2">
                      <FormField label={t("dashboard.pages.links.blockForm.embedLink.urlLabel")}>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={editEmbedLinkUrl}
                          onChange={(e) => setEditEmbedLinkUrl(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.embedLink.descriptionLabel")}>
                        <RichTextEditor html={editEmbedLinkDescription} onChange={setEditEmbedLinkDescription} />
                      </FormField>
                    </div>
                  ) : link.block_type === "maps" ? (
                    <div className="flex flex-col gap-2">
                      <FormField label={t("dashboard.pages.links.blockForm.maps.label")}>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            placeholder={t("dashboard.pages.links.blockForm.maps.placeholderEdit")}
                            value={editMapsUrl}
                            onChange={(e) => setEditMapsUrl(e.target.value)}
                            className="w-full min-w-0 flex-1 rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setMapsPickerOpenFor(link.id)}
                            className="flex-shrink-0 rounded-md border-2 border-jeon-ink px-2.5 py-1.5 text-[11px] font-bold text-jeon-purple hover:border-jeon-purple"
                          >
                            {t("dashboard.pages.links.blockForm.maps.pickOnMap")}
                          </button>
                        </div>
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.maps.behaviorLabel")}>
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-start gap-2 text-xs text-app-ink">
                            <input
                              type="radio"
                              name={`editMapsEmbed-${link.id}`}
                              checked={!editMapsEmbed}
                              onChange={() => setEditMapsEmbed(false)}
                              className="mt-0.5"
                            />
                            {t("dashboard.pages.links.blockForm.maps.openDirect")}
                          </label>
                          <label className="flex items-start gap-2 text-xs text-app-ink">
                            <input
                              type="radio"
                              name={`editMapsEmbed-${link.id}`}
                              checked={editMapsEmbed}
                              onChange={() => setEditMapsEmbed(true)}
                              className="mt-0.5"
                            />
                            {t("dashboard.pages.links.blockForm.maps.embedInline")}
                          </label>
                        </div>
                      </FormField>
                    </div>
                  ) : link.block_type === "project_showcase" ? (
                    <div className="flex flex-col gap-2">
                      <FormField label={t("dashboard.pages.links.blockForm.showcase.badgeLabel")} hint={t("dashboard.pages.links.blockForm.showcase.badgeHint")}>
                        <input
                          type="text"
                          placeholder={t("dashboard.pages.links.blockForm.showcase.badgePlaceholder")}
                          value={editShowcaseBadge}
                          onChange={(e) => setEditShowcaseBadge(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.showcase.descriptionLabel")} hint={t("dashboard.pages.links.blockForm.showcase.descriptionHint")}>
                        <RichTextEditor html={editShowcaseDescription} onChange={setEditShowcaseDescription} />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaUrlLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaUrlHint")}>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={editShowcaseUrl}
                          onChange={(e) => setEditShowcaseUrl(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                      <FormField label={t("dashboard.pages.links.blockForm.showcase.ctaTextLabel")} hint={t("dashboard.pages.links.blockForm.showcase.ctaTextHint")}>
                        <input
                          type="text"
                          placeholder={t("dashboard.pages.links.blockForm.showcase.ctaTextPlaceholder")}
                          value={editShowcaseCta}
                          onChange={(e) => setEditShowcaseCta(e.target.value)}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
                      </FormField>
                    </div>
                  ) : null}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setContentEditId(null)} className="flex-1 rounded-md border-2 border-jeon-ink py-1.5 text-[11px] font-bold text-app-muted">
                      {t("dashboard.pages.links.common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={savingContent}
                      onClick={() => handleSaveContent(link)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingContent ? t("dashboard.pages.links.common.saving") : t("dashboard.pages.links.common.save")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {drilldownBlock && (
        <BlockDrilldownEditor
          link={drilldownBlock}
          isPremium={page?.is_premium ?? false}
          products={products}
          onProductCreated={(product) => setProducts((prev) => [...prev, product])}
          onCommitCatalogRoot={(items) => saveCatalogItems(drilldownBlock, items)}
          onSaveFaqItems={(items) => handleSaveFaqItems(drilldownBlock, items)}
          onExit={() => setDrilldownBlockId(null)}
        />
      )}

      {addModalOpen && (
        <AddLinkModal
          category={addCategory}
          onCategoryChange={setAddCategory}
          search={addSearch}
          onSearchChange={setAddSearch}
          onClose={() => setAddModalOpen(false)}
          onSelectPlatform={handleSelectPlatform}
          onSelectContentTile={handleSelectContentTile}
          onQuickPasteLink={(url) => openLinkFormPrefilled("", url)}
          contentTiles={contentTiles}
        />
      )}

      {iconPickerLinkId &&
        (() => {
          const target = links.find((l) => l.id === iconPickerLinkId);
          if (!target) return null;
          return (
            <IconPickerModal
              currentKey={target.icon_key}
              onSelect={(icon) => handleSelectLibraryIcon(target, icon.key)}
              onClose={() => setIconPickerLinkId(null)}
            />
          );
        })()}

      {mapsPickerOpenFor && (
        <LocationPickerModal
          onSelect={(url) => {
            if (mapsPickerOpenFor === "add") setBlockMapsUrl(url);
            else setEditMapsUrl(url);
            setMapsPickerOpenFor(null);
          }}
          onClose={() => setMapsPickerOpenFor(null)}
        />
      )}

      {/* Dialog konfirmasi hapus -- permintaan langsung pengguna, 14 Agustus
          2026: "kalau mau hapus tampilkan toast peringatan dulu". Berlaku
          utk SEMUA block_type (tautan biasa maupun video/faq/maps/text/dst),
          trigger-nya satu tombol sampah yang sama di setiap kartu. */}
      {confirmDeleteId &&
        (() => {
          const target = links.find((l) => l.id === confirmDeleteId);
          if (!target) return null;
          const noun = target.block_type === "link" ? t("dashboard.pages.links.deleteConfirm.linkNoun") : blockTypeLabel[target.block_type]?.toLowerCase() ?? t("dashboard.pages.links.deleteConfirm.blockNoun");
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
              onClick={() => setConfirmDeleteId(null)}
            >
              <div
                className="w-full max-w-sm rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#111111] bg-jeon-coral text-[#111111]">
                    <TriangleAlert className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.links.deleteConfirm.title").replace("{noun}", noun)}</h2>
                    <p className="mt-1 text-xs text-app-muted">
                      {t("dashboard.pages.links.deleteConfirm.body")
                        .replace("{title}", target.title || t("dashboard.pages.links.deleteConfirm.untitled"))}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(null)}
                    className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:bg-app-surface-2"
                  >
                    {t("dashboard.pages.links.common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(confirmDeleteId);
                      setConfirmDeleteId(null);
                    }}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700"
                  >
                    {t("dashboard.pages.links.deleteConfirm.confirmButton")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Modal "+ Page" -- hanya minta judul (permintaan langsung pengguna:
          "menambah halaman dengan isi an hanya title nya saja"). Slug
          diturunkan otomatis dari judul (slugifyTitle) dengan retry
          tabrakan di handleCreatePage -- kreator tidak perlu tahu/pilih
          slug sama sekali, beda dari form dashboard/pages/page.tsx yang
          digantikan modul ini. Dropdown "Mulai dari" -- susulan permintaan
          langsung pengguna: "buat bisa duplikat isi dari page lainnya" --
          kosong (default) berarti halaman baru mulai kosong, pilih salah
          satu halaman lain (termasuk Home) untuk menyalin SELURUH isinya
          (bio/avatar/tema/tautan/blok/stiker/dst, lihat CreatePage backend). */}
      {creatingPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setCreatingPage(false)}>
          <form
            onSubmit={handleCreatePage}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 shadow-brutal"
          >
            <h2 className="font-display text-sm font-bold text-app-ink">{t("dashboard.pages.links.createPageModal.title")}</h2>
            <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.links.createPageModal.subtitle")}</p>
            <input
              type="text"
              autoFocus
              value={newPageTitle}
              onChange={(e) => setNewPageTitle(e.target.value)}
              placeholder={t("dashboard.pages.links.createPageModal.titlePlaceholder")}
              maxLength={80}
              className="mt-3 w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <label htmlFor="new-page-duplicate-from" className="mb-1 mt-3 block text-xs font-semibold text-app-ink">
              {t("dashboard.pages.links.createPageModal.startFromLabel")}
            </label>
            <select
              id="new-page-duplicate-from"
              value={duplicateFromId}
              onChange={(e) => setDuplicateFromId(e.target.value)}
              className="bg-app-surface w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
            >
              <option value="">{t("dashboard.pages.links.createPageModal.blankPage")}</option>
              <option value="primary">{t("dashboard.pages.links.createPageModal.duplicateFromHome")}</option>
              {extraPages.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {t("dashboard.pages.links.createPageModal.duplicateFromPage").replace("{name}", ep.name)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setCreatingPage(false)}
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:bg-app-surface-2"
              >
                {t("dashboard.pages.links.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={!newPageTitle.trim() || savingNewPage}
                className="flex-1 rounded-lg btn-primary py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {savingNewPage ? t("dashboard.pages.links.createPageModal.creating") : t("dashboard.pages.links.createPageModal.createButton")}
              </button>
            </div>
          </form>
        </div>
      )}

      <LivePreviewPanel
        page={page}
        links={links}
        products={products}
        pageType={activePage?.pageType}
        pageSlug={activePage?.slug}
        openUrl={activePage ? `${SITE_URL}/${accountUsername}/${activePage.slug}` : undefined}
        highlightLinkId={contentEditId ?? undefined}
      />
    </div>
    </>
  );
}

// AddCategory -- Populer/Sosial/Konten/Lanjutan (SPEC §10.5). "key" tetap
// dalam bahasa Indonesia -- itu ID INTERNAL state (addCategory), BUKAN teks
// yang tampil ke pengguna, jadi TIDAK perlu ikut diterjemahkan.
export type AddCategory = "populer" | "sosial" | "konten" | "lanjutan";
