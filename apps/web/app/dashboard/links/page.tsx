"use client";

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
  deleteCatalogItemImage,
  deleteExtraPage,
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
  uploadCatalogItemImage,
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
  IconBook,
  IconCamera,
  IconChart,
  IconChevronRight,
  IconSettings,
  IconClock,
  IconClose,
  IconColumns,
  IconCopy,
  IconFileText,
  IconGrid,
  IconGripVertical,
  IconLink,
  IconLock,
  IconMail,
  IconMapPin,
  IconMusicNote,
  IconPaintbrush,
  IconPencil,
  IconPhotoLibrary,
  IconPlayCircle,
  IconPlus,
  IconStar,
  IconTextLines,
  IconTrash,
  IconX,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import FormField from "@/components/FormField";
import HalamanSayaTabs from "@/components/HalamanSayaTabs";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";
import { detectLinkIcon } from "@/lib/link-icons";
import { getLibraryIcon } from "@/lib/icon-library";
import { LayoutGrid, TriangleAlert } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

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

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go), murni
// utk UI (sembunyikan tombol "Tambah" begitu penuh) -- backend tetap jadi
// sumber kebenaran validasinya.
const maxGalleryImages = 9;
// PREMIUM_EXTRA_PAGE_LIMIT -- SAMA PERSIS batas backend (premiumExtraPageLimit,
// page.go) untuk pool Halaman Bio/Landing tambahan (produk punya pool
// terpisah, lihat catatan activePage/extraPages di atas), murni utk UI.
const PREMIUM_EXTRA_PAGE_LIMIT = 5;

// buildBlockTypeLabel -- FUNGSI (bukan konstanta modul) supaya labelnya ikut
// berganti bahasa, sama seperti pola buildNavItems(t) di dashboard/layout.tsx.
function buildBlockTypeLabel(t: (key: string) => string): Record<string, string> {
  return {
    video: t("dashboard.pages.links.blockTypes.video"),
    contact_form: t("dashboard.pages.links.blockTypes.contactForm"),
    faq: t("dashboard.pages.links.blockTypes.faq"),
    maps: t("dashboard.pages.links.blockTypes.maps"),
    text: t("dashboard.pages.links.blockTypes.text"),
    accordion: t("dashboard.pages.links.blockTypes.accordion"),
    gallery: t("dashboard.pages.links.blockTypes.gallery"),
    audio: t("dashboard.pages.links.blockTypes.audio"),
    file: t("dashboard.pages.links.blockTypes.file"),
    project_showcase: t("dashboard.pages.links.blockTypes.projectShowcase"),
    catalog: t("dashboard.pages.links.blockTypes.catalog"),
  };
}

export type IconComponent = (props: { className?: string }) => React.ReactElement;

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
  key: "link" | "video" | "faq" | "contact_form" | "maps" | "text" | "accordion" | "gallery" | "audio" | "file" | "project_showcase" | "catalog";
  label: string;
  description: string;
  Icon: IconComponent;
};

// buildContentTiles -- FUNGSI (bukan konstanta modul) supaya label/
// deskripsinya ikut berganti bahasa, pola sama seperti buildBlockTypeLabel.
function buildContentTiles(t: (key: string) => string): ContentTile[] {
  return [
    { key: "link", label: t("dashboard.pages.links.contentTiles.link.label"), description: t("dashboard.pages.links.contentTiles.link.description"), Icon: IconLink },
    { key: "video", label: t("dashboard.pages.links.contentTiles.video.label"), description: t("dashboard.pages.links.contentTiles.video.description"), Icon: IconPlayCircle },
    { key: "faq", label: t("dashboard.pages.links.contentTiles.faq.label"), description: t("dashboard.pages.links.contentTiles.faq.description"), Icon: IconBook },
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- SATU judul klik-untuk-
    // buka bebas dari framing tanya-jawab (beda dari FAQ yang daftar Q&A),
    // cocok untuk kebijakan/detail/catatan tambahan apa pun.
    { key: "accordion", label: t("dashboard.pages.links.contentTiles.accordion.label"), description: t("dashboard.pages.links.contentTiles.accordion.description"), Icon: IconChevronRight },
    { key: "contact_form", label: t("dashboard.pages.links.contentTiles.contactForm.label"), description: t("dashboard.pages.links.contentTiles.contactForm.description"), Icon: IconMail },
    // Permintaan langsung pengguna (referensi tangkapan layar fitur "Maps"
    // Linktree): lokasi Google Maps, bisa ditampilkan tertanam (iframe) atau
    // sebagai tautan langsung -- lihat "Link behavior" di form.
    { key: "maps", label: t("dashboard.pages.links.contentTiles.maps.label"), description: t("dashboard.pages.links.contentTiles.maps.description"), Icon: IconMapPin },
    // Permintaan langsung pengguna (benchmark Lynk.id -- blok Teks sudah ada
    // di halaman utama mereka sejak awal, Jeonme sebelumnya cuma punya ini di
    // Halaman Tambahan). Paragraf polos, TANPA tautan/aksi -- murni konten
    // (pengumuman, deskripsi singkat, dsb) di antara blok-blok lain.
    { key: "text", label: t("dashboard.pages.links.contentTiles.text.label"), description: t("dashboard.pages.links.contentTiles.text.description"), Icon: IconTextLines },
    // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
    // 2026 (template portofolio/wisata s.id pakai grid multi-foto, mockup
    // "Music" kompetitor lain pakai pemutar audio tertanam -- keduanya belum
    // ada padanan di Jeonme). Foto/audio diunggah SETELAH blok dibuat (lihat
    // panel "Kelola foto"/"Kelola audio" yang muncul di kartu blok), bukan
    // lewat form pembuatan blok biasa -- beda dari tipe lain yang isinya
    // teks/URL, unggah file butuh multipart terpisah dari JSON create.
    { key: "gallery", label: t("dashboard.pages.links.contentTiles.gallery.label"), description: t("dashboard.pages.links.contentTiles.gallery.description"), Icon: IconPhotoLibrary },
    { key: "audio", label: t("dashboard.pages.links.contentTiles.audio.label"), description: t("dashboard.pages.links.contentTiles.audio.description"), Icon: IconMusicNote },
    // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
    // file pdf download". Pola upload sama seperti gallery/audio di atas
    // (file diunggah SETELAH blok dibuat, lewat panel "Kelola file" yang
    // muncul di kartu blok) -- beda dari produk digital berbayar di Toko,
    // blok ini gratis/lead-magnet (ebook, materi, template), tanpa checkout.
    { key: "file", label: t("dashboard.pages.links.contentTiles.file.label"), description: t("dashboard.pages.links.contentTiles.file.description"), Icon: IconFileText },
    // "project_showcase" -- permintaan langsung pengguna, 24 Agustus 2026:
    // kartu "Project Unggulan" (contoh tangkapan layar template "Dimas
    // Dev") -- gambar + badge + judul + deskripsi + tombol CTA, cocok utk
    // menonjolkan SATU karya/studi kasus di antara tautan biasa.
    { key: "project_showcase", label: t("dashboard.pages.links.contentTiles.projectShowcase.label"), description: t("dashboard.pages.links.contentTiles.projectShowcase.description"), Icon: IconCamera },
    // "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: "ada blok
    // Jenis Rumah ketika di klik akan tampil semua blok dengan isi jenis
    // jenis rumah yang ada" -- blok drill-down 2 tingkat (daftar item ->
    // detail per item, gambar bisa multiple), lihat CatalogTakeoverView
    // (PagePreview.tsx). Klik blok ini di halaman publik GANTI ISI HALAMAN
    // (bukan buka tautan/expand di tempat seperti tipe lain).
    { key: "catalog", label: t("dashboard.pages.links.contentTiles.catalog.label"), description: t("dashboard.pages.links.contentTiles.catalog.description"), Icon: IconGrid },
  ];
}

// Permintaan langsung pengguna, 14 Agustus 2026: "harusnya semua tipe ini
// [judul bisa diedit, ganti ikon, dst]" -- ikon default per block_type utk
// badge di kartu daftar. Dipisah dari label (buildBlockTypeLabel di atas)
// murni supaya ikonnya TIDAK perlu dihitung ulang tiap render bahasa
// berganti (Icon component-nya konstan, cuma teksnya yang berubah).
const BLOCK_TYPE_ICON: Record<string, IconComponent> = {
  video: IconPlayCircle,
  faq: IconBook,
  accordion: IconChevronRight,
  contact_form: IconMail,
  maps: IconMapPin,
  text: IconTextLines,
  gallery: IconPhotoLibrary,
  audio: IconMusicNote,
  file: IconFileText,
  project_showcase: IconCamera,
  catalog: IconGrid,
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
  // toolsOpenId -- restrukturisasi UX baris link (permintaan langsung
  // pengguna, 31 Agustus 2026: "design dan struktur tiap page masih kurang
  // secara ui dan ux"): strip 8+ ikon aksi tanpa label (jadwal/kunci/
  // sensitif/ikon x4/featured/duplikat/hapus) yang SEBELUMNYA selalu
  // tampil di TIAP kartu membuat baris gemuk & membingungkan -- sekarang
  // dilipat di balik satu tombol "Kelola" per kartu (accordion inline,
  // markup & handler aksi TIDAK berubah sama sekali, cuma dibungkus
  // kondisional). Jumlah klik ikut pindah jadi chip ringkas di baris
  // header (menggantikan footer sendiri yang memboroskan satu baris penuh).
  const [toolsOpenId, setToolsOpenId] = useState<string | null>(null);

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
    "video" | "contact_form" | "faq" | "maps" | "text" | "accordion" | "gallery" | "audio" | "file" | "project_showcase" | "catalog"
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

  // "catalog" -- permintaan langsung pengguna, 25 Agustus 2026: blok
  // drill-down "Jenis Rumah" -> daftar jenis -> detail per jenis, gambar
  // bisa multiple. Item (judul/deskripsi/foto) dikelola lewat
  // BlockDrilldownEditor (§10.5); saveCatalogItems tetap dipakai sebagai
  // titik commit tunggal ke backend.
  const [, setCatalogSavingId] = useState<string | null>(null);
  // catalogItemImageUploadingKey -- `${linkId}:${itemId}`, satu item bisa
  // upload sementara item LAIN di blok yang sama tidak ikut disabled.
  const [catalogItemImageUploadingKey, setCatalogItemImageUploadingKey] = useState<string | null>(null);

  const [contentEditId, setContentEditId] = useState<string | null>(null);
  // drilldownBlockId -- id blok "catalog"/"faq" yang sedang dibuka lewat
  // BlockDrilldownEditor (redesain 6 September 2026, gaya Linktree: klik
  // blok -> masuk ke dalamnya). `drilldownBlock` LIVE (bukan snapshot) --
  // di-lookup ulang dari `links` tiap render, jadi update optimis dari
  // saveCatalogItems otomatis mengalir ke frame yang sedang terbuka tanpa
  // perlu sinkronisasi manual.
  const [drilldownBlockId, setDrilldownBlockId] = useState<string | null>(null);
  const drilldownBlock = links.find((l) => l.id === drilldownBlockId) ?? null;
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
    type: "faq" | "contact_form" | "text" | "accordion" | "gallery" | "audio" | "file" | "project_showcase" | "catalog",
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
    else openBlockFormPrefilled(tile.key, tile.label);
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

  // ---------- "catalog" -- panel "Kelola Katalog" ----------
  // Semua fungsi di bawah PATCH block_data.items UTUH (pola sama FAQ --
  // array lengkap dikirim ulang tiap perubahan, TIDAK ada endpoint CRUD
  // item terpisah di backend) KECUALI foto (endpoint upload/hapus
  // tersendiri, lihat handleCatalogImageUpload/Delete di bawah -- foto
  // butuh multipart file, tidak cocok dikirim lewat JSON block_data biasa).

  function catalogItemsOf(link: LinkItem): CatalogItem[] {
    return ((link.block_data?.items as CatalogItem[]) ?? []).filter((it) => it && it.id);
  }

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

  // uploadCatalogItemImageFile -- inti handleCatalogImageUpload, dipisah dari
  // event <input type=file> (6 September 2026, BlockDrilldownEditor.tsx
  // memanggil File langsung dari onChange-nya sendiri, bukan lewat event
  // React di sini).
  async function uploadCatalogItemImageFile(link: LinkItem, itemId: string, file: File) {
    const key = `${link.id}:${itemId}`;
    setCatalogItemImageUploadingKey(key);
    setError(null);
    try {
      const { images } = await uploadCatalogItemImage(link.id, itemId, file);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id
            ? { ...l, block_data: { ...l.block_data, items: catalogItemsOf(l).map((it) => (it.id === itemId ? { ...it, images } : it)) } }
            : l
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.uploadPhotoFailed"));
    } finally {
      setCatalogItemImageUploadingKey(null);
    }
  }


  async function handleCatalogImageDelete(link: LinkItem, itemId: string, index: number) {
    setError(null);
    try {
      const { images } = await deleteCatalogItemImage(link.id, itemId, index);
      setLinks((prev) =>
        prev.map((l) =>
          l.id === link.id
            ? { ...l, block_data: { ...l.block_data, items: catalogItemsOf(l).map((it) => (it.id === itemId ? { ...it, images } : it)) } }
            : l
        )
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.links.errors.deletePhotoFailed"));
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
    if (field !== "description" && !value) return;
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
      const items = blockFaqItems.filter((it) => it.question.trim() && it.answer.trim());
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
    }
    setError(null);
    setSavingBlock(true);
    try {
      const created = await currentCreateBlock({
        block_type: blockType,
        title: blockTitle.trim(),
        url: blockUrl,
        block_data: blockData,
        description: blockType === "project_showcase" ? blockShowcaseDescription.trim() : undefined,
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
      blockData = { badge_text: editShowcaseBadge.trim(), cta_text: editShowcaseCta.trim() };
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
      <div className={`min-w-0 ${drilldownBlock ? "hidden" : ""}`}>
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
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.avatar_url} alt={page.username} className="h-full w-full object-cover" />
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
          href={`/dashboard/links/builder/${activePage ? activePage.id : "main"}`}
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
                  )
                }
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
              </select>
            </FormField>
            {(blockType === "gallery" ||
              blockType === "audio" ||
              blockType === "file" ||
              blockType === "project_showcase" ||
              blockType === "catalog") && (
              <p className="rounded-lg bg-jeon-purple/5 px-3 py-2 text-[11px] text-app-muted">
                {blockType === "gallery"
                  ? t("dashboard.pages.links.blockForm.uploadHints.gallery")
                  : blockType === "audio"
                  ? t("dashboard.pages.links.blockForm.uploadHints.audio")
                  : blockType === "file"
                  ? t("dashboard.pages.links.blockForm.uploadHints.file")
                  : blockType === "catalog"
                  ? t("dashboard.pages.links.blockForm.uploadHints.catalog")
                  : t("dashboard.pages.links.blockForm.uploadHints.projectShowcase")}
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
                  <textarea
                    placeholder={t("dashboard.pages.links.blockForm.showcase.descriptionPlaceholder")}
                    value={blockShowcaseDescription}
                    onChange={(e) => setBlockShowcaseDescription(e.target.value)}
                    rows={2}
                    maxLength={240}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                  />
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
                <textarea
                  placeholder={t("dashboard.pages.links.blockForm.text.placeholder")}
                  value={blockText}
                  onChange={(e) => setBlockText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "accordion" && (
              <FormField label={t("dashboard.pages.links.blockForm.accordion.label")}>
                <textarea
                  placeholder={t("dashboard.pages.links.blockForm.accordion.placeholderAdd")}
                  value={blockAccordionText}
                  onChange={(e) => setBlockAccordionText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                      <textarea
                        placeholder={t("dashboard.pages.links.blockForm.faq.answerPlaceholder")}
                        value={item.answer}
                        onChange={(e) => setBlockFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, answer: e.target.value } : it)))}
                        rows={2}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
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
          {links.map((link, index) => (
            <li
              key={link.id}
              draggable
              onDragStart={() => setDragId(link.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(link.id)}
              className={`flex flex-col gap-2.5 rounded-jmd border bg-app-surface p-3.5 shadow-card transition-colors ${
                link.is_active ? "border-app-border" : "border-app-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Kontrol urutan -- grip = afordans drag mouse (kartu <li>
                    draggable), plus dua tombol ▲/▼ yang bisa difokus keyboard
                    sebagai ALTERNATIF drag (§22 "drag alternative move up/
                    down"). Nonaktif di batas (item pertama/terakhir). */}
                <div className="flex flex-shrink-0 flex-col items-center">
                  <button
                    type="button"
                    onClick={() => moveLinkByOffset(index, -1)}
                    disabled={index === 0}
                    aria-label={t("dashboard.pages.links.moveUp")}
                    title={t("dashboard.pages.links.moveUp")}
                    className="text-app-muted hover:text-jeon-purple disabled:opacity-25 disabled:hover:text-app-muted"
                  >
                    <IconChevronRight className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                  <IconGripVertical className="h-3.5 w-3.5 cursor-grab text-app-muted/70" />
                  <button
                    type="button"
                    onClick={() => moveLinkByOffset(index, 1)}
                    disabled={index === links.length - 1}
                    aria-label={t("dashboard.pages.links.moveDown")}
                    title={t("dashboard.pages.links.moveDown")}
                    className="text-app-muted hover:text-jeon-purple disabled:opacity-25 disabled:hover:text-app-muted"
                  >
                    <IconChevronRight className="h-3.5 w-3.5 rotate-90" />
                  </button>
                </div>
                {/* Badge ikon -- permintaan langsung pengguna, 14 Agustus 2026:
                    "harusnya semua tipe ini... bisa ubah icon" -- urutan resolusi
                    SAMA PERSIS dgn tautan biasa (custom_icon_url > icon_key galeri
                    > deteksi platform dari URL [khusus tautan biasa] > ikon default
                    per block_type), berlaku utk SEMUA block_type. */}
                {link.custom_icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.custom_icon_url}
                    alt=""
                    title={t("dashboard.pages.links.linkCard.customIcon")}
                    className="h-8 w-8 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                  />
                ) : link.icon_key && getLibraryIcon(link.icon_key) ? (
                  (() => {
                    const libraryIcon = getLibraryIcon(link.icon_key)!;
                    return (
                      <span
                        title={libraryIcon.label}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
                      >
                        <libraryIcon.Icon className="h-4 w-4" />
                      </span>
                    );
                  })()
                ) : link.block_type === "link" ? (
                  (() => {
                    const { Icon, label, badgeClass } = detectLinkIcon(link.url);
                    return (
                      <span title={label} className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${badgeClass}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    );
                  })()
                ) : (
                  (() => {
                    const DefaultIcon = BLOCK_TYPE_ICON[link.block_type];
                    return (
                      <span
                        title={blockTypeLabel[link.block_type]}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-jsm border-2 border-[#111111] bg-jeon-lavender text-[#111111]"
                      >
                        <DefaultIcon className="h-4 w-4" />
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
                      className="w-full rounded-md border border-jeon-purple px-2 py-1 text-sm font-bold text-app-ink focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-app-ink">{link.title}</p>
                      {/* Permintaan langsung pengguna, 14 Agustus 2026: "judul nya
                          bisa diedit juga sama seperti yang lain" -- sebelumnya
                          cuma tautan biasa yang bisa ubah judul inline, sekarang
                          berlaku utk SEMUA block_type (updateLink sudah generik). */}
                      <button
                        type="button"
                        onClick={() => startEditField(link, "title")}
                        className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple"
                        title={t("dashboard.pages.links.linkCard.editTitle")}
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {link.block_type !== "link" && (
                    <span className="mt-1 inline-block rounded-full border-2 border-[#111111] bg-jeon-lavender px-2 py-0.5 text-[10px] font-bold text-[#111111]">
                      {blockTypeLabel[link.block_type]}
                    </span>
                  )}
                </div>
                {/* Chip jumlah klik -- pindah dari footer kartu ke baris
                    header (restrukturisasi UX 31 Agustus 2026): informasi
                    ringkas tak layak memboroskan satu baris penuh sendiri. */}
                <span className="hidden flex-shrink-0 items-center gap-1 rounded-full bg-app-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-app-muted sm:flex">
                  <IconChart className="h-3 w-3" />
                  {link.click_count.toLocaleString("id-ID")}
                </span>
                {(link.block_type === "video" ||
                  link.block_type === "maps" ||
                  link.block_type === "text" ||
                  link.block_type === "accordion" ||
                  link.block_type === "project_showcase" ||
                  link.block_type === "catalog" ||
                  link.block_type === "faq") && (
                  <button
                    type="button"
                    onClick={() =>
                      link.block_type === "catalog" || link.block_type === "faq"
                        ? setDrilldownBlockId(link.id)
                        : openContentEdit(link)
                    }
                    className="flex-shrink-0 rounded-lg px-2 py-1.5 text-xs font-bold text-jeon-purple hover:bg-jeon-purple/10"
                  >
                    {t("dashboard.pages.links.linkCard.editContent")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setToolsOpenId((v) => (v === link.id ? null : link.id))}
                  aria-expanded={toolsOpenId === link.id}
                  title={t("dashboard.pages.links.linkCard.manageTools")}
                  className={`flex h-8 flex-shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-bold transition-colors ${
                    toolsOpenId === link.id ? "bg-jeon-purple/10 text-jeon-purple" : "text-app-muted hover:bg-jeon-purple/10 hover:text-jeon-purple"
                  }`}
                >
                  <IconSettings className="h-4 w-4" />
                  <IconChevronRight className={`h-3 w-3 transition-transform ${toolsOpenId === link.id ? "rotate-90" : ""}`} />
                </button>
                <Toggle checked={link.is_active} onChange={() => handleToggleActive(link)} label={t("dashboard.pages.links.linkCard.activateLabel").replace("{title}", link.title)} />
              </div>

              {link.block_type === "link" && (
                <div className="ml-11 flex items-center gap-1.5">
                  {editingField?.id === link.id && editingField.field === "url" ? (
                    <input
                      type="url"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => saveEditField(link)}
                      onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                      className="w-full rounded-md border border-jeon-purple px-2 py-1 text-xs text-app-muted focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="truncate text-xs text-app-muted">{link.url}</p>
                      <button type="button" onClick={() => startEditField(link, "url")} className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple" title={t("dashboard.pages.links.linkCard.editUrl")}>
                        <IconPencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* description -- permintaan langsung pengguna, 24 Agustus
                  2026: subjudul opsional di bawah judul (kartu
                  ikon+judul+deskripsi+panah, contoh template "Dimas Dev"),
                  diedit inline sama seperti judul/URL di atas. */}
              {link.block_type === "link" && (
                <div className="ml-11 flex items-center gap-1.5">
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
                      className="w-full rounded-md border border-jeon-purple px-2 py-1 text-xs text-app-muted focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="truncate text-xs italic text-app-muted">{link.description || t("dashboard.pages.links.linkCard.noDescription")}</p>
                      <button
                        type="button"
                        onClick={() => startEditField(link, "description")}
                        className="flex-shrink-0 p-1 text-app-muted hover:text-jeon-purple"
                        title={t("dashboard.pages.links.linkCard.editDescription")}
                      >
                        <IconPencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Strip alat kelola -- jadwal/kunci/sensitif/kontrol ikon/
                  featured/duplikat/hapus. Dilipat di balik tombol "Kelola"
                  di header (restrukturisasi UX 31 Agustus 2026, lihat
                  catatan toolsOpenId) -- markup & handler di dalamnya
                  TIDAK berubah, cuma dibungkus kondisional + kontainer. */}
              {toolsOpenId === link.id && (
              <div className="ml-11 flex flex-wrap items-center gap-1.5 rounded-jsm border-2 border-jeon-ink bg-app-surface-2 p-2">
                {link.block_type === "link" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openScheduleForm(link)}
                      title={t("dashboard.pages.links.linkCard.scheduleTooltip")}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                        link.starts_at && link.ends_at ? "text-jeon-purple" : "text-app-muted"
                      }`}
                    >
                      <IconClock className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openLockForm(link)}
                      title={t("dashboard.pages.links.linkCard.lockTooltip")}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                        link.lock_type ? "text-jeon-purple" : "text-app-muted"
                      }`}
                    >
                      <IconLock className="h-4 w-4" />
                    </button>
                  </>
                )}
                {/* Tandai konten sensitif -- permintaan langsung pengguna, 20
                    Agustus 2026: "tambahkan juga sensitive content supaya
                    nanti tampil ke user ketika mau akses". Versi RINGKAS
                    (satu klik toggle, bukan form kunci penuh) khusus block_type
                    SELAIN "link" -- lihat catatan lengkap di handleToggleSensitive
                    kenapa age/kode/subscribe tidak ditawarkan di sini. */}
                {link.block_type !== "link" && (
                  <button
                    type="button"
                    onClick={() => handleToggleSensitive(link)}
                    title={link.lock_type === "sensitive" ? t("dashboard.pages.links.linkCard.unmarkSensitive") : t("dashboard.pages.links.linkCard.markSensitive")}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                      link.lock_type === "sensitive" ? "text-jeon-purple" : "text-app-muted"
                    }`}
                  >
                    <span aria-hidden className="text-sm leading-none">⚠️</span>
                  </button>
                )}
                {/* Kontrol ikon -- permintaan langsung pengguna, 14 Agustus 2026:
                    "harusnya semua tipe ini... bisa ubah icon" -- sebelumnya
                    unggah/galeri/hapus ikon cuma tersedia utk tautan biasa,
                    sekarang berlaku utk SEMUA block_type (UploadIcon/DeleteIcon
                    backend & updateLink icon_key sudah generik per-row, tidak
                    peduli block_type). */}
                <label
                  title={link.custom_icon_url ? t("dashboard.pages.links.linkCard.changeCustomIcon") : t("dashboard.pages.links.linkCard.uploadCustomIcon")}
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                    link.custom_icon_url ? "text-jeon-purple" : "text-app-muted"
                  }`}
                >
                  {iconUploadingId === link.id ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                  ) : (
                    <IconCamera className="h-4 w-4" />
                  )}
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                    onChange={(e) => handleIconUpload(e, link)}
                    disabled={iconUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIconPickerLinkId(link.id)}
                  title={t("dashboard.pages.links.linkCard.pickFromIconGallery")}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                    link.icon_key ? "text-jeon-purple" : "text-app-muted"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                {/* Warna ikon kustom -- permintaan langsung pengguna, 22
                    Agustus 2026: "bisa mengubah warna yang kita inginkan
                    untuk icon di blok daripada hanya warna hitam saja".
                    Disembunyikan kalau pakai ikon kustom hasil unggah
                    (custom_icon_url, gambar raster) -- warna cuma berlaku
                    utk ikon SVG (galeri/deteksi otomatis), tidak masuk akal
                    "mewarnai ulang" foto. <input type="color"> asli
                    disembunyikan (opacity-0) menutupi swatch bulat supaya
                    klik di mana pun pada tombol membuka color picker native
                    browser -- pola sama seperti label unggah file di atas. */}
                {!link.custom_icon_url && (
                  <label
                    title={link.icon_color ? t("dashboard.pages.links.linkCard.changeIconColor") : t("dashboard.pages.links.linkCard.pickIconColor")}
                    className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-jeon-purple/10"
                  >
                    {link.icon_color ? (
                      <span
                        className="h-4 w-4 rounded-full ring-1 ring-border"
                        style={{ backgroundColor: link.icon_color }}
                        aria-hidden
                      />
                    ) : (
                      <IconPaintbrush className="h-4 w-4 text-app-muted" />
                    )}
                    <input
                      type="color"
                      value={link.icon_color || "#000000"}
                      onChange={(e) => handleIconColorChange(link, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                )}
                {link.icon_color && (
                  <button
                    type="button"
                    onClick={() => handleClearIconColor(link)}
                    title={t("dashboard.pages.links.linkCard.clearIconColor")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                )}
                {(link.custom_icon_url || link.icon_key) && (
                  <button
                    type="button"
                    onClick={() => handleRemoveIcon(link)}
                    title={t("dashboard.pages.links.linkCard.removeIcon")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-red-50 hover:text-red-600"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                )}
                {/* Modul "Featured Link" (permintaan langsung pengguna,
                    referensi "Featured Layout" Linktree sungguhan): tampil
                    sebagai kartu thumbnail 16:9, bukan baris klasik -- lihat
                    panel unggah thumbnail di bawah yang muncul begitu status
                    ini menyala. Khusus tautan biasa (thumbnail 16:9 tidak
                    relevan utk blok video/faq/maps/text yang punya rendering
                    sendiri). */}
                {link.block_type === "link" && (
                  <button
                    type="button"
                    onClick={() => handleToggleFeatured(link)}
                    title={link.is_featured ? t("dashboard.pages.links.linkCard.unfeature") : t("dashboard.pages.links.linkCard.makeFeatured")}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-jeon-purple/10 ${
                      link.is_featured ? "text-jeon-purple" : "text-app-muted"
                    }`}
                  >
                    <IconStar className="h-4 w-4" />
                  </button>
                )}
                {/* "Edit Konten" pindah ke baris header kartu (aksi utama
                    blok harus selalu terlihat, bukan tersembunyi di strip). */}
                <div className="flex-1" />
                {/* Duplikat -- permintaan langsung pengguna, 20 Agustus 2026:
                    "di bagian link bio di blok nya tambahkan fungsi duplicate".
                    Berlaku utk SEMUA block_type, langsung tereksekusi tanpa
                    dialog konfirmasi (beda dari Hapus di bawah) -- duplikat
                    murni MENAMBAH baris baru, tidak menghapus/mengubah apa pun
                    yang sudah ada, jadi tidak ada risiko kehilangan data yang
                    perlu dikonfirmasi dulu. */}
                <button
                  type="button"
                  onClick={() => handleDuplicate(link)}
                  title={t("dashboard.pages.links.linkCard.duplicate")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-jeon-purple/10 hover:text-jeon-purple"
                >
                  <IconCopy className="h-4 w-4" />
                </button>
                {/* Permintaan langsung pengguna, 14 Agustus 2026: "kalau mau
                    hapus tampilkan toast peringatan dulu" -- sebelumnya hapus
                    langsung tanpa konfirmasi apa pun (link maupun blok
                    lainnya), sekarang buka dialog peringatan dulu (lihat
                    confirmDeleteId & modalnya di bawah <ul>). */}
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(link.id)}
                  title={t("dashboard.pages.links.common.delete")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
              )}

              {link.block_type === "link" && link.is_featured && (
                <div className="ml-11 flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  {link.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={link.thumbnail_url} alt="" className="h-14 w-24 flex-shrink-0 rounded-md object-cover ring-1 ring-black/5" />
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

              {/* Panel "Kelola foto" -- blok "gallery" (hasil analisa galeri
                  tema kompetitor, 17 Agustus 2026), SELALU tampil (bukan
                  dibalik toggle "Edit Konten") -- pola sama seperti panel
                  Featured Link di atas, karena kelola-foto justru INTI dari
                  blok ini, bukan pengaturan sekunder. */}
              {link.block_type === "gallery" && (
                <div className="ml-11 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  <p className="text-[11px] font-semibold text-app-muted">
                    {(((link.block_data?.images as string[]) ?? []).length)}/{maxGalleryImages} {t("dashboard.pages.links.galleryPanel.photoCountSuffix")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {((link.block_data?.images as string[]) ?? []).map((src, i) => (
                      <div key={i} className="group relative h-16 w-16 flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
                        <button
                          type="button"
                          onClick={() => handleGalleryImageDelete(link, i)}
                          title={t("dashboard.pages.links.galleryPanel.deletePhoto")}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
                        >
                          <IconX className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
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
              {link.block_type === "project_showcase" && (
                <div className="ml-11 flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                  {link.block_data?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={link.block_data.image_url as string}
                      alt=""
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
              {link.block_type === "audio" && (
                <div className="ml-11 flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
              {link.block_type === "file" && (
                <div className="ml-11 flex items-center gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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

              {link.block_type === "link" &&
                (scheduleEditId === link.id ? (
                  <div className="ml-11 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
                    <div className="ml-11 flex items-center justify-between rounded-lg bg-jeon-warning/15 px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-jeon-warning">
                        {t("dashboard.pages.links.schedulePanel.scheduledLabel")} {new Date(link.starts_at).toLocaleString("id-ID")} {t("dashboard.pages.links.schedulePanel.until")} {new Date(link.ends_at).toLocaleString("id-ID")}
                      </span>
                      <button type="button" onClick={() => handleClearSchedule(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                        {t("dashboard.pages.links.schedulePanel.cancelSchedule")}
                      </button>
                    </div>
                  )
                ))}

              {link.block_type === "link" &&
                (lockEditId === link.id ? (
                  <div className="ml-11 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                    <select
                      value={lockTypeInput}
                      onChange={(e) => setLockTypeInput(e.target.value as "age" | "code" | "subscribe" | "sensitive")}
                      className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
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
                    <div className="ml-11 flex items-center justify-between rounded-lg bg-jeon-purple/10 px-2.5 py-1.5">
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
                link.block_type === "project_showcase") &&
                contentEditId === link.id && (
                <div className="ml-11 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
                      <textarea
                        placeholder={t("dashboard.pages.links.blockForm.text.placeholder")}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  ) : link.block_type === "accordion" ? (
                    <FormField label={t("dashboard.pages.links.blockForm.accordion.label")}>
                      <textarea
                        placeholder={t("dashboard.pages.links.blockForm.accordion.placeholderEdit")}
                        value={editAccordionText}
                        onChange={(e) => setEditAccordionText(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
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
                        <textarea
                          placeholder={t("dashboard.pages.links.contentEdit.showcaseDescriptionPlaceholder")}
                          value={editShowcaseDescription}
                          onChange={(e) => setEditShowcaseDescription(e.target.value)}
                          rows={2}
                          maxLength={240}
                          className="w-full rounded-md border border-app-border px-2.5 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                        />
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

              {/* Statistik klik pindah jadi chip ringkas di baris header
                  kartu (restrukturisasi UX 31 Agustus 2026) -- footer
                  terpisah yang lama memboroskan satu baris penuh per kartu. */}
            </li>
          ))}
          {links.length === 0 && <EmptyState as="li" text={t("dashboard.pages.links.emptyState")} />}
        </ul>

      </div>

      {drilldownBlock && (
        <BlockDrilldownEditor
          link={drilldownBlock}
          isPremium={page?.is_premium ?? false}
          uploadingItemId={
            catalogItemImageUploadingKey?.startsWith(`${drilldownBlock.id}:`)
              ? catalogItemImageUploadingKey.slice(drilldownBlock.id.length + 1)
              : null
          }
          onCommitCatalogRoot={(items) => saveCatalogItems(drilldownBlock, items)}
          onSaveFaqItems={(items) => handleSaveFaqItems(drilldownBlock, items)}
          onUploadImage={(itemId, file) => uploadCatalogItemImageFile(drilldownBlock, itemId, file)}
          onDeleteImage={(itemId, index) => handleCatalogImageDelete(drilldownBlock, itemId, index)}
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
              className="w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
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
      />
    </div>
    </>
  );
}

// AddCategory -- Populer/Sosial/Konten/Lanjutan (SPEC §10.5). "key" tetap
// dalam bahasa Indonesia -- itu ID INTERNAL state (addCategory), BUKAN teks
// yang tampil ke pengguna, jadi TIDAK perlu ikut diterjemahkan.
export type AddCategory = "populer" | "sosial" | "konten" | "lanjutan";
