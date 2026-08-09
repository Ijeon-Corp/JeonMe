"use client";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  createBlock,
  createLink,
  deleteLink,
  deleteLinkIcon,
  getMyPage,
  listLinks,
  listProducts,
  reorderLinks,
  updateLink,
  updateMyPage,
  uploadAvatar,
  uploadLinkIcon,
} from "@/lib/api-client";
import {
  IconBook,
  IconCamera,
  IconChart,
  IconChevronRight,
  IconClock,
  IconClose,
  IconFacebook,
  IconGripVertical,
  IconInstagram,
  IconLink,
  IconLinkedin,
  IconLock,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPlayCircle,
  IconPlus,
  IconSearch,
  IconSpotify,
  IconTelegram,
  IconTextLines,
  IconTiktok,
  IconTrash,
  IconWhatsapp,
  IconX,
  IconYoutube,
} from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import LivePreviewPanel from "@/components/LivePreviewPanel";
import ShareButton from "@/components/ShareButton";
import Toggle from "@/components/Toggle";
import { detectLinkIcon } from "@/lib/link-icons";

const BLOCK_TYPE_LABEL: Record<string, string> = {
  video: "Video",
  contact_form: "Formulir Kontak",
  faq: "FAQ",
  maps: "Lokasi",
  text: "Teks",
};

type IconComponent = (props: { className?: string }) => React.ReactElement;

// Modal "Tambah" ala Linktree (tangkapan layar pengguna): ganti trigger
// polos jadi galeri pilihan berkategori. Cuma 2 kategori nyata yang bisa
// diisi jujur dari kapabilitas Jeonme -- "Sosial Media" (tautan cepat ke
// platform populer, memakai ulang ikon deteksi platform yang sudah ada di
// link-icons.ts) dan "Konten" (tipe blok yang SUDAH direndang di halaman
// publik utama: link/video/faq/contact_form/maps/text). "Collection" & "Product" ala
// Linktree SENGAJA TIDAK dibuatkan tile -- grup tautan carousel belum ada
// konsepnya, dan Produk sudah punya halaman/tabel sendiri (bukan varian
// baris links), membuat tile untuk keduanya di sini cuma tiruan tanpa fungsi.
type PlatformQuickAdd = {
  key: string;
  label: string;
  description: string;
  Icon: IconComponent;
  kind: "link" | "video";
  urlTemplate: string;
  badgeClass: string;
};

const DISARANKAN_KEYS = ["instagram", "tiktok", "youtube", "whatsapp", "spotify"];

// badgeClass -- samakan persis dengan warna brand di lib/link-icons.ts
// (dipakai di daftar tautan & pratinjau publik) supaya modal ini pun
// menampilkan warna platform yang sama, bukan abu-abu netral generik.
const SUGGESTED_PLATFORMS: PlatformQuickAdd[] = [
  {
    key: "instagram",
    label: "Instagram",
    description: "Tautkan profil Instagram kamu",
    Icon: IconInstagram,
    kind: "link",
    urlTemplate: "https://instagram.com/",
    badgeClass: "bg-gradient-to-br from-[#FEDA75] via-[#D62976] to-[#4F5BD5] text-white",
  },
  {
    key: "tiktok",
    label: "TikTok",
    description: "Tampilkan video TikTok sebagai embed",
    Icon: IconTiktok,
    kind: "video",
    urlTemplate: "",
    badgeClass: "bg-black text-white",
  },
  {
    key: "youtube",
    label: "YouTube",
    description: "Tampilkan video YouTube sebagai embed",
    Icon: IconYoutube,
    kind: "video",
    urlTemplate: "",
    badgeClass: "bg-[#FF0000] text-white",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Tautkan nomor WhatsApp kamu",
    Icon: IconWhatsapp,
    kind: "link",
    urlTemplate: "https://wa.me/62",
    badgeClass: "bg-[#25D366] text-white",
  },
  {
    key: "spotify",
    label: "Spotify",
    description: "Tautkan profil atau album Spotify",
    Icon: IconSpotify,
    kind: "link",
    urlTemplate: "https://open.spotify.com/",
    badgeClass: "bg-[#1DB954] text-white",
  },
  {
    key: "telegram",
    label: "Telegram",
    description: "Tautkan akun Telegram kamu",
    Icon: IconTelegram,
    kind: "link",
    urlTemplate: "https://t.me/",
    badgeClass: "bg-[#26A5E4] text-white",
  },
  {
    key: "x",
    label: "X (Twitter)",
    description: "Tautkan profil X kamu",
    Icon: IconX,
    kind: "link",
    urlTemplate: "https://x.com/",
    badgeClass: "bg-black text-white",
  },
  {
    key: "facebook",
    label: "Facebook",
    description: "Tautkan halaman atau profil Facebook",
    Icon: IconFacebook,
    kind: "link",
    urlTemplate: "https://facebook.com/",
    badgeClass: "bg-[#1877F2] text-white",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description: "Tautkan profil LinkedIn",
    Icon: IconLinkedin,
    kind: "link",
    urlTemplate: "https://linkedin.com/in/",
    badgeClass: "bg-[#0A66C2] text-white",
  },
  {
    key: "email",
    label: "Email",
    description: "Tautkan alamat email kamu",
    Icon: IconMail,
    kind: "link",
    urlTemplate: "mailto:",
    badgeClass: "bg-slate-600 text-white",
  },
];

type ContentTile = {
  key: "link" | "video" | "faq" | "contact_form" | "maps" | "text";
  label: string;
  description: string;
  Icon: IconComponent;
};

const CONTENT_TILES: ContentTile[] = [
  { key: "link", label: "Tautan", description: "Tautkan ke halaman web mana pun", Icon: IconLink },
  { key: "video", label: "Video", description: "Tampilkan video YouTube/TikTok sebagai embed", Icon: IconPlayCircle },
  { key: "faq", label: "FAQ", description: "Pertanyaan yang sering ditanyakan pengunjung", Icon: IconBook },
  { key: "contact_form", label: "Formulir Kontak", description: "Kumpulkan nama, email, dan pesan pengunjung", Icon: IconMail },
  // Permintaan langsung pengguna (referensi tangkapan layar fitur "Maps"
  // Linktree): lokasi Google Maps, bisa ditampilkan tertanam (iframe) atau
  // sebagai tautan langsung -- lihat "Link behavior" di form.
  { key: "maps", label: "Lokasi", description: "Tampilkan lokasi di Google Maps (tertanam atau tautan langsung)", Icon: IconMapPin },
  // Permintaan langsung pengguna (benchmark Lynk.id -- blok Teks sudah ada
  // di halaman utama mereka sejak awal, Jeonme sebelumnya cuma punya ini di
  // Halaman Tambahan). Paragraf polos, TANPA tautan/aksi -- murni konten
  // (pengumuman, deskripsi singkat, dsb) di antara blok-blok lain.
  { key: "text", label: "Teks", description: "Tambahkan paragraf teks bebas di antara tautan", Icon: IconTextLines },
];

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
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profil bisa diedit langsung dari sini (permintaan langsung pengguna) --
  // sebelumnya baris ini cuma pratinjau baca-saja, mengedit harus lewat
  // halaman Desain. Nama tampilan & bio disimpan lewat updateMyPage yang
  // sudah ada (satu sumber kebenaran yang SAMA dengan halaman Desain, cuma
  // sekarang ada 2 pintu masuk untuk mengeditnya).
  const [editingProfileField, setEditingProfileField] = useState<"name" | "bio" | null>(null);
  const [profileEditValue, setProfileEditValue] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [addingLink, setAddingLink] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newURL, setNewURL] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);

  // Permintaan langsung pengguna: unggah gambar kustom per tautan
  // (menggantikan ikon platform otomatis di halaman publik).
  const [iconUploadingId, setIconUploadingId] = useState<string | null>(null);

  // Modal "Tambah" ala Linktree.
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<"disarankan" | "sosial" | "konten">("disarankan");
  const [addSearch, setAddSearch] = useState("");

  // Edit inline judul/URL langsung di kartu (ikon pensil) -- sebelumnya
  // judul/URL tidak bisa diubah sama sekali setelah dibuat, padahal backend
  // (updateLink) sudah mendukungnya sejak awal.
  const [editingField, setEditingField] = useState<{ id: string; field: "title" | "url" } | null>(null);
  const [editingValue, setEditingValue] = useState("");

  // No.78 (Sprint 9): penjadwalan tautan -- pola sama persis seperti
  // penjadwalan flash sale produk (No.68).
  const [scheduleEditId, setScheduleEditId] = useState<string | null>(null);
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  // No.79 (Sprint 9): kunci tautan (usia/kode/subscribe).
  const [lockEditId, setLockEditId] = useState<string | null>(null);
  const [lockTypeInput, setLockTypeInput] = useState<"age" | "code" | "subscribe">("code");
  const [lockCodeInput, setLockCodeInput] = useState("");
  const [lockMinAgeInput, setLockMinAgeInput] = useState("18");
  const [savingLock, setSavingLock] = useState(false);

  // No.77 (Sprint 9): blok konten baru (video/formulir kontak/FAQ).
  const [addingBlock, setAddingBlock] = useState(false);
  const [blockType, setBlockType] = useState<"video" | "contact_form" | "faq" | "maps" | "text">("video");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockVideoUrl, setBlockVideoUrl] = useState("");
  // Benchmark Lynk.id: blok Teks -- paragraf polos, TANPA tautan/aksi.
  const [blockText, setBlockText] = useState("");
  const [blockFaqItems, setBlockFaqItems] = useState<{ question: string; answer: string }[]>([
    { question: "", answer: "" },
  ]);
  // Permintaan langsung pengguna: blok "Lokasi" (Maps) -- embed default MATI
  // (radio "Go directly to URL") sampai tautan berhasil diresolusi backend,
  // supaya kreator tidak mengira embed langsung aktif sebelum tersimpan.
  const [blockMapsUrl, setBlockMapsUrl] = useState("");
  const [blockMapsEmbed, setBlockMapsEmbed] = useState(true);
  const [savingBlock, setSavingBlock] = useState(false);

  const [contentEditId, setContentEditId] = useState<string | null>(null);
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editFaqItems, setEditFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [editMapsUrl, setEditMapsUrl] = useState("");
  const [editMapsEmbed, setEditMapsEmbed] = useState(true);
  const [editText, setEditText] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts()])
      .then(([p, l, prod]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

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
      await updateMyPage(patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : `Gagal menyimpan ${field === "name" ? "nama tampilan" : "bio"}.`);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !page) return;

    setAvatarUploading(true);
    try {
      const { avatar_url } = await uploadAvatar(file);
      setPage({ ...page, avatar_url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah foto profil.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleCreateLink(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newURL.trim()) return;
    try {
      const created = await createLink({ title: newTitle, url: newURL });
      setLinks((prev) => [...prev, created]);
      setNewTitle("");
      setNewURL("");
      setAddingLink(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat tautan.");
    }
  }

  // Dipanggil dari modal "Tambah" -- membuka form tautan biasa yang sudah
  // ada (addingLink), dengan judul/URL PRAISI dari tile "Tautan" (kosong)
  // atau baris platform Sosial Media (judul platform + contoh URL siap
  // dilengkapi, mis. "https://wa.me/62").
  function openLinkFormPrefilled(title: string, url: string) {
    setNewTitle(title);
    setNewURL(url);
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

  function openBlockFormPrefilled(type: "faq" | "contact_form" | "text", title: string) {
    setBlockType(type);
    setBlockTitle(title);
    if (type === "text") setBlockText("");
    setAddingBlock(true);
    setAddModalOpen(false);
  }

  // openMapsFormPrefilled -- tile "Lokasi" (permintaan langsung pengguna).
  function openMapsFormPrefilled() {
    setBlockType("maps");
    setBlockTitle("Lokasi Kami");
    setBlockMapsUrl("");
    setBlockMapsEmbed(true);
    setAddingBlock(true);
    setAddModalOpen(false);
  }

  function handleSelectPlatform(platform: PlatformQuickAdd) {
    if (platform.kind === "video") {
      openVideoFormPrefilled(`Video ${platform.label}`);
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
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui tautan.");
    }
  }

  async function handleDelete(id: string) {
    const previous = links;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus tautan.");
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
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah ikon tautan.");
    } finally {
      setIconUploadingId(null);
    }
  }

  async function handleRemoveIcon(link: LinkItem) {
    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, custom_icon_url: "" } : l)));
    try {
      await deleteLinkIcon(link.id);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus ikon tautan.");
    }
  }

  function startEditField(link: LinkItem, field: "title" | "url") {
    setEditingField({ id: link.id, field });
    setEditingValue(field === "title" ? link.title : link.url);
  }

  async function saveEditField(link: LinkItem) {
    if (!editingField || editingField.id !== link.id) return;
    const field = editingField.field;
    const value = editingValue.trim();
    setEditingField(null);
    if (!value || value === (field === "title" ? link.title : link.url)) return;

    const previous = links;
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, [field]: value } : l)));
    try {
      await updateLink(link.id, field === "title" ? { title: value } : { url: value });
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : `Gagal memperbarui ${field === "title" ? "judul" : "URL"}.`);
    }
  }

  function openScheduleForm(link: LinkItem) {
    setScheduleEditId(link.id);
    setScheduleStart(link.starts_at ? link.starts_at.slice(0, 16) : "");
    setScheduleEnd(link.ends_at ? link.ends_at.slice(0, 16) : "");
  }

  async function handleSaveSchedule(link: LinkItem) {
    if (!scheduleStart || !scheduleEnd) {
      setError("Waktu mulai dan berakhir jadwal wajib diisi.");
      return;
    }
    const startsAt = new Date(scheduleStart).toISOString();
    const endsAt = new Date(scheduleEnd).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("Waktu berakhir jadwal harus setelah waktu mulai.");
      return;
    }
    setError(null);
    setSavingSchedule(true);
    try {
      await updateLink(link.id, { starts_at: startsAt, ends_at: endsAt });
      const refreshed = await listLinks();
      setLinks(refreshed);
      setScheduleEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menjadwalkan tautan.");
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleClearSchedule(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_schedule: true });
      const refreshed = await listLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membatalkan jadwal.");
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
      setError("Kode akses wajib diisi untuk kunci kode.");
      return;
    }
    if (lockTypeInput === "age" && (!lockMinAgeInput || Number(lockMinAgeInput) < 13)) {
      setError("Batas usia minimal 13 tahun.");
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
      const refreshed = await listLinks();
      setLinks(refreshed);
      setLockEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunci tautan.");
    } finally {
      setSavingLock(false);
    }
  }

  async function handleClearLock(link: LinkItem) {
    setError(null);
    try {
      await updateLink(link.id, { clear_lock: true });
      const refreshed = await listLinks();
      setLinks(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuka kunci tautan.");
    }
  }

  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    if (!blockTitle.trim()) {
      setError("Judul blok wajib diisi.");
      return;
    }
    let blockData: Record<string, unknown> = {};
    let blockUrl: string | undefined;
    if (blockType === "video") {
      if (!blockVideoUrl.trim()) {
        setError("Tautan video wajib diisi.");
        return;
      }
      blockData = { video_url: blockVideoUrl.trim() };
    } else if (blockType === "faq") {
      const items = blockFaqItems.filter((it) => it.question.trim() && it.answer.trim());
      if (items.length === 0) {
        setError("Isi minimal 1 pertanyaan FAQ (pertanyaan & jawaban).");
        return;
      }
      blockData = { items };
    } else if (blockType === "maps") {
      if (!blockMapsUrl.trim()) {
        setError("Tautan Google Maps wajib diisi.");
        return;
      }
      blockUrl = blockMapsUrl.trim();
      blockData = { embed: blockMapsEmbed };
    } else if (blockType === "text") {
      if (!blockText.trim()) {
        setError("Isi teksnya dulu.");
        return;
      }
      blockData = { text: blockText.trim() };
    }
    setError(null);
    setSavingBlock(true);
    try {
      const created = await createBlock({ block_type: blockType, title: blockTitle.trim(), url: blockUrl, block_data: blockData });
      setLinks((prev) => [...prev, created]);
      setAddingBlock(false);
      setBlockTitle("");
      setBlockVideoUrl("");
      setBlockFaqItems([{ question: "", answer: "" }]);
      setBlockMapsUrl("");
      setBlockMapsEmbed(true);
      setBlockText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat blok.");
    } finally {
      setSavingBlock(false);
    }
  }

  function openContentEdit(link: LinkItem) {
    setContentEditId(link.id);
    if (link.block_type === "video") {
      setEditVideoUrl((link.block_data?.video_url as string) ?? "");
    } else if (link.block_type === "faq") {
      const items = (link.block_data?.items as { question: string; answer: string }[]) ?? [];
      setEditFaqItems(items.length > 0 ? items : [{ question: "", answer: "" }]);
    } else if (link.block_type === "maps") {
      setEditMapsUrl(link.url ?? "");
      setEditMapsEmbed(Boolean(link.block_data?.embed));
    } else if (link.block_type === "text") {
      setEditText((link.block_data?.text as string) ?? "");
    }
  }

  async function handleSaveContent(link: LinkItem) {
    let blockData: Record<string, unknown>;
    let blockUrl: string | undefined;
    if (link.block_type === "video") {
      if (!editVideoUrl.trim()) {
        setError("Tautan video wajib diisi.");
        return;
      }
      blockData = { video_url: editVideoUrl.trim() };
    } else if (link.block_type === "maps") {
      if (!editMapsUrl.trim()) {
        setError("Tautan Google Maps wajib diisi.");
        return;
      }
      blockUrl = editMapsUrl.trim();
      blockData = { embed: editMapsEmbed };
    } else if (link.block_type === "text") {
      if (!editText.trim()) {
        setError("Isi teksnya dulu.");
        return;
      }
      blockData = { text: editText.trim() };
    } else {
      const items = editFaqItems.filter((it) => it.question.trim() && it.answer.trim());
      if (items.length === 0) {
        setError("Isi minimal 1 pertanyaan FAQ (pertanyaan & jawaban).");
        return;
      }
      blockData = { items };
    }
    setError(null);
    setSavingContent(true);
    try {
      await updateLink(link.id, { url: blockUrl, block_data: blockData });
      const refreshed = await listLinks();
      setLinks(refreshed);
      setContentEditId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan konten blok.");
    } finally {
      setSavingContent(false);
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = links.findIndex((l) => l.id === dragId);
    const to = links.findIndex((l) => l.id === targetId);
    if (from === -1 || to === -1) return;

    const reordered = [...links];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
    setLinks(withPositions);
    setDragId(null);

    reorderLinks(withPositions.map((l) => ({ id: l.id, position: l.position }))).catch((err) => {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan urutan tautan.");
    });
  }

  if (loading) return <PageSkeleton />;

  return (
    // "max-w-2xl" (kolom konten) & "mx-auto max-w-6xl" (grid) DIHAPUS --
    // permintaan pengguna: panel pratinjau harus menempel persis di pojok
    // kanan JENDELA browser (bukan tepi kanan kotak 1152px yang masih
    // dikelilingi jarak kosong simetris). Lihat catatan lengkap di
    // DesignPageShell.tsx.
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
      <div>
        <p className="mt-1 text-sm text-muted">Seret untuk mengubah urutan. Nonaktifkan tanpa menghapus lewat sakelar.</p>

        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

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
              title="Ganti foto profil"
              className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-card disabled:opacity-60"
            >
              {page.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.avatar_url} alt={page.username} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary-subtle font-heading text-lg font-bold text-primary">
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
                  className="w-full rounded-md border border-primary px-2 py-1 font-heading text-base font-bold text-ink focus:outline-none"
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-heading text-base font-bold text-ink">{page.display_name || page.username}</p>
                  <button type="button" onClick={() => startEditProfileField("name")} className="flex-shrink-0 text-muted hover:text-primary" title="Ubah nama tampilan">
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
                  placeholder="Tambahkan deskripsi singkat"
                  maxLength={160}
                  className="mt-1 w-full rounded-md border border-primary px-2 py-1 text-sm text-muted focus:outline-none"
                />
              ) : (
                <div className="mt-1 flex items-center gap-1.5">
                  <p className="truncate text-sm text-muted">{page.bio || "Tambahkan deskripsi singkat"}</p>
                  <button type="button" onClick={() => startEditProfileField("bio")} className="flex-shrink-0 text-muted hover:text-primary" title="Ubah deskripsi">
                    <IconPencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Baris quick-add -- jalan pintas ke 3 tipe blok nyata yang kami
            punya (Video/FAQ/Formulir Kontak), plus tombol "+" generik yang
            membuka modal lengkap yang sama seperti tombol besar di bawah.
            Ikon media/gambar/koleksi ala referensi SENGAJA tidak ditiru --
            Jeonme belum punya blok galeri gambar/koleksi di halaman utama. */}
        <div className="mt-3 flex items-center gap-2">
          {[
            { tile: CONTENT_TILES.find((t) => t.key === "video")!, key: "video" },
            { tile: CONTENT_TILES.find((t) => t.key === "faq")!, key: "faq" },
            { tile: CONTENT_TILES.find((t) => t.key === "contact_form")!, key: "contact_form" },
          ].map(({ tile, key }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelectContentTile(tile)}
              title={tile.label}
              className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted hover:border-primary hover:text-primary"
            >
              <tile.Icon className="h-4 w-4" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] font-bold text-ink ring-1 ring-border">
                +
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setAddCategory("disarankan");
              setAddSearch("");
              setAddModalOpen(true);
            }}
            title="Lihat semua pilihan"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-ink hover:bg-gray-200"
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setAddCategory("disarankan");
            setAddSearch("");
            setAddModalOpen(true);
          }}
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white shadow-card transition-transform hover:scale-[1.01]"
        >
          <IconPlus className="h-4 w-4" />
          Tambah
        </button>

        {addingLink && (
          <form onSubmit={handleCreateLink} className="glass mt-4 flex flex-col gap-2 rounded-3xl p-4 shadow-card sm:flex-row">
            <input
              type="text"
              required
              autoFocus
              placeholder="Judul tautan"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              type="url"
              required
              placeholder="https://..."
              value={newURL}
              onChange={(e) => setNewURL(e.target.value)}
              className="flex-1 rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button type="submit" className="btn-primary rounded-lg px-4 py-2.5 text-sm font-bold text-white">
              Tambah
            </button>
            <button
              type="button"
              onClick={() => setAddingLink(false)}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-bold text-muted hover:border-ink/30"
            >
              Batal
            </button>
          </form>
        )}

        {addingBlock && (
          <form onSubmit={handleCreateBlock} className="glass mt-4 flex flex-col gap-2 rounded-3xl p-3.5 shadow-card">
            <select
              value={blockType}
              onChange={(e) => setBlockType(e.target.value as "video" | "contact_form" | "faq" | "maps" | "text")}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="video">Video (YouTube/TikTok)</option>
              <option value="contact_form">Formulir Kontak</option>
              <option value="faq">FAQ</option>
              <option value="maps">Lokasi (Google Maps)</option>
              <option value="text">Teks</option>
            </select>
            <input
              type="text"
              required
              placeholder={blockType === "text" ? "Judul blok (internal, tidak tampil ke publik)" : "Judul blok"}
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            {blockType === "text" && (
              <textarea
                placeholder="Isi teks yang tampil di halaman publik"
                value={blockText}
                onChange={(e) => setBlockText(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "video" && (
              <input
                type="url"
                placeholder="https://youtube.com/... atau https://tiktok.com/..."
                value={blockVideoUrl}
                onChange={(e) => setBlockVideoUrl(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "maps" && (
              <div className="flex flex-col gap-2">
                <input
                  type="url"
                  placeholder="Tempel tautan berbagi lokasi Google Maps (mis. https://maps.app.goo.gl/...)"
                  value={blockMapsUrl}
                  onChange={(e) => setBlockMapsUrl(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[11px] font-semibold text-muted">Saat pengunjung berinteraksi dengan tautan ini:</p>
                <label className="flex items-start gap-2 text-xs text-ink">
                  <input
                    type="radio"
                    name="blockMapsEmbed"
                    checked={!blockMapsEmbed}
                    onChange={() => setBlockMapsEmbed(false)}
                    className="mt-0.5"
                  />
                  Buka tautan Google Maps langsung
                </label>
                <label className="flex items-start gap-2 text-xs text-ink">
                  <input
                    type="radio"
                    name="blockMapsEmbed"
                    checked={blockMapsEmbed}
                    onChange={() => setBlockMapsEmbed(true)}
                    className="mt-0.5"
                  />
                  Tampilkan peta Google Maps tertanam di profil
                </label>
              </div>
            )}
            {blockType === "faq" && (
              <div className="flex flex-col gap-2">
                {blockFaqItems.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                    <input
                      type="text"
                      placeholder="Pertanyaan"
                      value={item.question}
                      onChange={(e) => setBlockFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, question: e.target.value } : it)))}
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <textarea
                      placeholder="Jawaban"
                      value={item.answer}
                      onChange={(e) => setBlockFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, answer: e.target.value } : it)))}
                      rows={2}
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBlockFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-bold text-primary hover:underline"
                >
                  + Tambah pertanyaan
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddingBlock(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button type="submit" disabled={savingBlock} className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60">
                {savingBlock ? "Membuat..." : "Buat Blok"}
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
              className={`flex flex-col gap-2.5 rounded-2xl border bg-white p-3.5 shadow-card transition-colors ${
                link.is_active ? "border-border" : "border-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <IconGripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-muted" />
                {link.block_type === "link" &&
                  (link.custom_icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={link.custom_icon_url}
                      alt=""
                      title="Ikon kustom"
                      className="h-8 w-8 flex-shrink-0 rounded-xl object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    (() => {
                      const { Icon, label, badgeClass } = detectLinkIcon(link.url);
                      return (
                        <span title={label} className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${badgeClass}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                      );
                    })()
                  ))}
                <div className="min-w-0 flex-1">
                  {editingField?.id === link.id && editingField.field === "title" ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onBlur={() => saveEditField(link)}
                      onKeyDown={(e) => e.key === "Enter" && saveEditField(link)}
                      className="w-full rounded-md border border-primary px-2 py-1 text-sm font-bold text-ink focus:outline-none"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-bold text-ink">{link.title}</p>
                      {link.block_type === "link" && (
                        <button
                          type="button"
                          onClick={() => startEditField(link, "title")}
                          className="flex-shrink-0 text-muted hover:text-primary"
                          title="Ubah judul"
                        >
                          <IconPencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  {link.block_type !== "link" && (
                    <span className="mt-1 inline-block rounded-full bg-primary-subtle px-2 py-0.5 text-[10px] font-bold text-primary">
                      {BLOCK_TYPE_LABEL[link.block_type]}
                    </span>
                  )}
                </div>
                {link.block_type === "link" && (
                  <ShareButton
                    title={link.title}
                    url={link.url}
                    className="!h-8 !w-8 flex-shrink-0 !rounded-lg !bg-transparent !text-muted !shadow-none hover:!bg-primary-subtle hover:!text-primary"
                  />
                )}
                <Toggle checked={link.is_active} onChange={() => handleToggleActive(link)} label={`Aktifkan ${link.title}`} />
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
                      className="w-full rounded-md border border-primary px-2 py-1 text-xs text-muted focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="truncate text-xs text-muted">{link.url}</p>
                      <button type="button" onClick={() => startEditField(link, "url")} className="flex-shrink-0 text-muted hover:text-primary" title="Ubah URL">
                        <IconPencil className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Baris ikon aksi -- jadwal/kunci (khusus tautan biasa), jumlah klik, hapus. */}
              <div className="ml-11 flex items-center gap-2">
                {link.block_type === "link" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openScheduleForm(link)}
                      title="Jadwalkan tampil/sembunyi"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                        link.starts_at && link.ends_at ? "text-primary" : "text-muted"
                      }`}
                    >
                      <IconClock className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openLockForm(link)}
                      title="Kunci tautan"
                      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-primary-subtle ${
                        link.lock_type ? "text-primary" : "text-muted"
                      }`}
                    >
                      <IconLock className="h-4 w-4" />
                    </button>
                    {/* Permintaan langsung pengguna: unggah gambar kustom per
                        tautan, menggantikan ikon platform otomatis di halaman
                        publik. */}
                    <label
                      title={link.custom_icon_url ? "Ganti ikon kustom" : "Unggah ikon kustom"}
                      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-primary-subtle ${
                        link.custom_icon_url ? "text-primary" : "text-muted"
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
                    {link.custom_icon_url && (
                      <button
                        type="button"
                        onClick={() => handleRemoveIcon(link)}
                        title="Hapus ikon kustom (kembali ke deteksi otomatis)"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-600"
                      >
                        <IconClose className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
                {(link.block_type === "video" || link.block_type === "faq" || link.block_type === "maps" || link.block_type === "text") && (
                  <button
                    type="button"
                    onClick={() => openContentEdit(link)}
                    className="rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary-subtle"
                  >
                    Edit Konten
                  </button>
                )}
                <div className="flex-1" />
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <IconChart className="h-3.5 w-3.5" />
                  {link.click_count.toLocaleString("id-ID")} klik
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(link.id)}
                  title="Hapus tautan"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>

              {link.block_type === "link" &&
                (scheduleEditId === link.id ? (
                  <div className="ml-11 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                    <div className="flex gap-1.5">
                      <input
                        type="datetime-local"
                        value={scheduleStart}
                        onChange={(e) => setScheduleStart(e.target.value)}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                      <input
                        type="datetime-local"
                        value={scheduleEnd}
                        onChange={(e) => setScheduleEnd(e.target.value)}
                        className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setScheduleEditId(null)}
                        className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={savingSchedule}
                        onClick={() => handleSaveSchedule(link)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingSchedule ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </div>
                ) : (
                  link.starts_at &&
                  link.ends_at && (
                    <div className="ml-11 flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-accent-dark">
                        Terjadwal {new Date(link.starts_at).toLocaleString("id-ID")} s/d {new Date(link.ends_at).toLocaleString("id-ID")}
                      </span>
                      <button type="button" onClick={() => handleClearSchedule(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                        Batalkan
                      </button>
                    </div>
                  )
                ))}

              {link.block_type === "link" &&
                (lockEditId === link.id ? (
                  <div className="ml-11 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                    <select
                      value={lockTypeInput}
                      onChange={(e) => setLockTypeInput(e.target.value as "age" | "code" | "subscribe")}
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    >
                      <option value="code">Kode akses</option>
                      <option value="age">Konfirmasi usia</option>
                      <option value="subscribe">Wajib subscribe (email/WhatsApp)</option>
                    </select>
                    {lockTypeInput === "code" && (
                      <input
                        type="text"
                        placeholder="Kode akses"
                        value={lockCodeInput}
                        onChange={(e) => setLockCodeInput(e.target.value)}
                        className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    )}
                    {lockTypeInput === "age" && (
                      <input
                        type="number"
                        min={13}
                        max={99}
                        placeholder="Batas usia"
                        value={lockMinAgeInput}
                        onChange={(e) => setLockMinAgeInput(e.target.value)}
                        className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    )}
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLockEditId(null)}
                        className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={savingLock}
                        onClick={() => handleSaveLock(link)}
                        className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        {savingLock ? "Menyimpan..." : "Simpan"}
                      </button>
                    </div>
                  </div>
                ) : (
                  link.lock_type && (
                    <div className="ml-11 flex items-center justify-between rounded-lg bg-secondary-subtle px-2.5 py-1.5">
                      <span className="text-[11px] font-semibold text-secondary-dark">
                        Terkunci -- {link.lock_type === "code" ? "kode akses" : link.lock_type === "age" ? `usia ${link.lock_min_age ?? 18}+` : "wajib subscribe"}
                      </span>
                      <button type="button" onClick={() => handleClearLock(link)} className="text-[11px] font-bold text-red-600 hover:underline">
                        Buka Kunci
                      </button>
                    </div>
                  )
                ))}

              {(link.block_type === "video" || link.block_type === "faq" || link.block_type === "maps" || link.block_type === "text") && contentEditId === link.id && (
                <div className="ml-11 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                  {link.block_type === "video" ? (
                    <input
                      type="url"
                      placeholder="https://youtube.com/... atau https://tiktok.com/..."
                      value={editVideoUrl}
                      onChange={(e) => setEditVideoUrl(e.target.value)}
                      className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  ) : link.block_type === "text" ? (
                    <textarea
                      placeholder="Isi teks yang tampil di halaman publik"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  ) : link.block_type === "maps" ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="url"
                        placeholder="Tempel tautan berbagi lokasi Google Maps"
                        value={editMapsUrl}
                        onChange={(e) => setEditMapsUrl(e.target.value)}
                        className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                      <p className="text-[10px] font-semibold text-muted">Saat pengunjung berinteraksi dengan tautan ini:</p>
                      <label className="flex items-start gap-2 text-xs text-ink">
                        <input
                          type="radio"
                          name={`editMapsEmbed-${link.id}`}
                          checked={!editMapsEmbed}
                          onChange={() => setEditMapsEmbed(false)}
                          className="mt-0.5"
                        />
                        Buka tautan Google Maps langsung
                      </label>
                      <label className="flex items-start gap-2 text-xs text-ink">
                        <input
                          type="radio"
                          name={`editMapsEmbed-${link.id}`}
                          checked={editMapsEmbed}
                          onChange={() => setEditMapsEmbed(true)}
                          className="mt-0.5"
                        />
                        Tampilkan peta Google Maps tertanam di profil
                      </label>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {editFaqItems.map((item, i) => (
                        <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
                          <input
                            type="text"
                            placeholder="Pertanyaan"
                            value={item.question}
                            onChange={(e) => setEditFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, question: e.target.value } : it)))}
                            className="w-full rounded-md border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
                          />
                          <textarea
                            placeholder="Jawaban"
                            value={item.answer}
                            onChange={(e) => setEditFaqItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, answer: e.target.value } : it)))}
                            rows={2}
                            className="w-full rounded-md border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setEditFaqItems((prev) => prev.filter((_, idx) => idx !== i))}
                            className="self-end text-[10px] font-bold text-red-600 hover:underline"
                          >
                            Hapus item
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setEditFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                        className="self-start text-[11px] font-bold text-primary hover:underline"
                      >
                        + Tambah pertanyaan
                      </button>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setContentEditId(null)} className="flex-1 rounded-md border border-border py-1.5 text-[11px] font-bold text-muted">
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={savingContent}
                      onClick={() => handleSaveContent(link)}
                      className="btn-primary flex-1 rounded-md py-1.5 text-[11px] font-bold text-white disabled:opacity-60"
                    >
                      {savingContent ? "Menyimpan..." : "Simpan"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {links.length === 0 && <EmptyState as="li" text='Belum ada tautan -- klik "Tambah" di atas.' />}
        </ul>

      </div>

      {addModalOpen && (
        <AddModal
          category={addCategory}
          onCategoryChange={setAddCategory}
          search={addSearch}
          onSearchChange={setAddSearch}
          onClose={() => setAddModalOpen(false)}
          onSelectPlatform={handleSelectPlatform}
          onSelectContentTile={handleSelectContentTile}
          onQuickPasteLink={(url) => openLinkFormPrefilled("", url)}
        />
      )}

      <LivePreviewPanel page={page} links={links} products={products} />
    </div>
  );
}

const ADD_CATEGORIES = [
  { key: "disarankan", label: "Disarankan" },
  { key: "sosial", label: "Sosial Media" },
  { key: "konten", label: "Konten" },
] as const;

function isUrlLike(value: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(value.trim());
}

function AddModal({
  category,
  onCategoryChange,
  search,
  onSearchChange,
  onClose,
  onSelectPlatform,
  onSelectContentTile,
  onQuickPasteLink,
}: {
  category: "disarankan" | "sosial" | "konten";
  onCategoryChange: (c: "disarankan" | "sosial" | "konten") => void;
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onSelectPlatform: (p: PlatformQuickAdd) => void;
  onSelectContentTile: (t: ContentTile) => void;
  onQuickPasteLink: (url: string) => void;
}) {
  const searchLower = search.trim().toLowerCase();
  const pastedUrl = isUrlLike(search);

  const contentRows = searchLower
    ? CONTENT_TILES.filter((t) => t.label.toLowerCase().includes(searchLower))
    : category === "konten"
      ? CONTENT_TILES
      : [];

  const platformRows = searchLower
    ? SUGGESTED_PLATFORMS.filter((p) => p.label.toLowerCase().includes(searchLower))
    : category === "sosial"
      ? SUGGESTED_PLATFORMS
      : category === "disarankan"
        ? SUGGESTED_PLATFORMS.filter((p) => DISARANKAN_KEYS.includes(p.key))
        : [];

  const sectionLabel = searchLower
    ? "Hasil Pencarian"
    : category === "disarankan"
      ? "Disarankan"
      : category === "sosial"
        ? "Sosial Media"
        : "Konten";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-heading text-lg font-bold text-ink">Tambah</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
            <IconSearch className="h-4 w-4 flex-shrink-0 text-muted" />
            <input
              type="text"
              autoFocus
              placeholder="Tempel atau cari tautan"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {pastedUrl && (
            <button
              type="button"
              onClick={() => onQuickPasteLink(search.trim())}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary-subtle/30 p-3 text-left hover:bg-primary-subtle/50"
            >
              <IconLink className="h-5 w-5 flex-shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Tambahkan tautan ini</p>
                <p className="truncate text-xs text-muted">{search.trim()}</p>
              </div>
            </button>
          )}

          {!searchLower && (
            <>
              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {ADD_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => onCategoryChange(cat.key)}
                    className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      category === cat.key ? "bg-ink text-white" : "bg-gray-100 text-muted hover:bg-gray-200"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="mb-4 grid grid-cols-4 gap-2">
                {CONTENT_TILES.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => onSelectContentTile(tile)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border p-2.5 hover:border-primary/50"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-subtle text-primary">
                      <tile.Icon className="h-5 w-5" />
                    </span>
                    <span className="text-center text-[11px] font-semibold text-ink">{tile.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {(contentRows.length > 0 || platformRows.length > 0) && (
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{sectionLabel}</p>
          )}

          <div className="flex flex-col gap-1">
            {contentRows.map((tile) => (
              <button
                key={tile.key}
                type="button"
                onClick={() => onSelectContentTile(tile)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <tile.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{tile.label}</p>
                  <p className="truncate text-xs text-muted">{tile.description}</p>
                </div>
                <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
              </button>
            ))}

            {platformRows.map((platform) => (
              <button
                key={platform.key}
                type="button"
                onClick={() => onSelectPlatform(platform)}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-gray-50"
              >
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${platform.badgeClass}`}>
                  <platform.Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{platform.label}</p>
                  <p className="truncate text-xs text-muted">{platform.description}</p>
                </div>
                <IconChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
