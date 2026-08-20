"use client";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  ExtraPageDetail,
  LinkItem,
  MyPage,
  PageStickerData,
  THEME_PRESETS,
  createExtraPageBlock,
  createExtraPageLink,
  deleteAudioBlock,
  deleteGalleryImage,
  deleteLink,
  reorderExtraPageLinks,
  updateExtraPage,
  uploadAudioBlock,
  uploadExtraPageAvatar,
  uploadExtraPageBackground,
  uploadGalleryImage,
} from "@/lib/api-client";
import {
  CUSTOM_BUTTON_ROUNDED_OPTIONS,
  CUSTOM_BUTTON_SHADOW_OPTIONS,
  CUSTOM_BUTTON_STYLE_OPTIONS,
  CUSTOM_FONT_OPTIONS,
  PAGE_THEMES,
} from "@/lib/page-themes";
import {
  IconBook,
  IconCheck,
  IconChevronRight,
  IconExternal,
  IconGripVertical,
  IconLink,
  IconLock,
  IconMail,
  IconMapPin,
  IconMusicNote,
  IconPaintbrush,
  IconPhotoLibrary,
  IconPlayCircle,
  IconPlus,
  IconSparkle,
  IconTextLines,
  IconTrash,
  IconX,
} from "@/components/icons";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import Toggle from "@/components/Toggle";
import { SOCIAL_PLATFORMS, SocialPlatformKey } from "@/lib/social-links";
import { SITE_URL } from "@/lib/site";

type BlockType = "link" | "video" | "faq" | "contact_form" | "maps" | "text" | "accordion" | "gallery" | "audio";

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go).
const maxGalleryImages = 9;

// LAYOUT_OPTIONS -- paritas penuh dengan dashboard/design/header/page.tsx
// (lihat catatan lengkap di sana) -- daftarnya SENGAJA disalin apa adanya
// di sini (bukan diimpor dari satu sumber), konsisten dengan pola "dua
// jalur kode berbeda" yang sudah dipakai proyek ini untuk paritas
// halaman utama/Toko (CONTENT_TILES/BLOCK_LABEL di atas juga begitu).
// 7 opsi baru (split/ticket/headline/ribbon/duo/masthead/portrait) --
// lihat catatan lengkap di dashboard/design/header/page.tsx & renderBioHeader
// (PagePreview.tsx).
const LAYOUT_OPTIONS: { value: MyPage["layout_variant"]; label: string; description: string }[] = [
  { value: "centered", label: "Centered", description: "Avatar besar di tengah -- gaya klasik, bawaan." },
  { value: "banner", label: "Banner", description: "Avatar kecil rata kiri, sebaris dengan nama." },
  { value: "card", label: "Card", description: "Identitas dibungkus kartu, avatar menonjol di tepi atas." },
  { value: "spotlight", label: "Spotlight", description: "Avatar besar, nama di dalam badge bulat." },
  { value: "cover", label: "Cover", description: "Pita warna di atas ala foto sampul." },
  { value: "minimal", label: "Minimal", description: "Avatar kecil sebaris nama, konten jadi fokus." },
  { value: "hero", label: "Hero", description: "Foto profil tampil besar edge-to-edge sebagai latar. Isi Foto Profil dulu." },
  { value: "polaroid", label: "Polaroid", description: "Avatar kotak dibingkai putih & dimiringkan ala foto polaroid." },
  { value: "split", label: "Split", description: "2 kolom -- foto persegi di kiri, nama & bio di kanan. Kesan formal ala CV digital." },
  { value: "ticket", label: "Ticket", description: "Dua bagian dipisah garis putus-putus ala tiket/boarding pass." },
  { value: "headline", label: "Headline", description: "Nama & bio dulu di atas, foto kecil menyusul di bawah." },
  { value: "ribbon", label: "Ribbon", description: "Badge aksen di sudut avatar, nama dalam pita selebar penuh." },
  { value: "duo", label: "Duo", description: "Avatar & nama jadi satu chip pil ringkas, rata tengah." },
  { value: "masthead", label: "Masthead", description: "Pita warna selebar penuh berisi avatar+nama+bio langsung di dalamnya." },
  { value: "portrait", label: "Portrait", description: "Foto tegak dibingkai & berbayang ala poster. Isi Foto Profil dulu." },
];

const CONTENT_TILES: { key: BlockType; label: string; description: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { key: "link", label: "Tautan", description: "Tautkan ke halaman web mana pun", Icon: IconLink },
  { key: "video", label: "Video", description: "Embed video YouTube/TikTok", Icon: IconPlayCircle },
  { key: "faq", label: "FAQ", description: "Pertanyaan yang sering ditanyakan", Icon: IconBook },
  // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
  // lalu keluar text, bukan hanya untuk faq saja" -- lihat catatan lengkap
  // di dashboard/links/page.tsx (pola sama persis, dipakai ulang di sini
  // untuk paritas halaman utama/Toko).
  { key: "accordion", label: "Accordion", description: "Satu judul yang bisa diklik untuk membuka isi teksnya", Icon: IconChevronRight },
  { key: "contact_form", label: "Formulir Kontak", description: "Kumpulkan nama, email, dan pesan", Icon: IconMail },
  { key: "maps", label: "Lokasi", description: "Google Maps (tertanam atau tautan)", Icon: IconMapPin },
  { key: "text", label: "Teks", description: "Paragraf bebas", Icon: IconTextLines },
  // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
  // 2026, lihat catatan lengkap di dashboard/links/page.tsx (pola sama
  // persis, dipakai ulang di sini untuk paritas halaman utama/Toko).
  { key: "gallery", label: "Galeri Foto", description: "Grid beberapa foto sekaligus", Icon: IconPhotoLibrary },
  { key: "audio", label: "Audio/Musik", description: "Pemutar audio tertanam di bio", Icon: IconMusicNote },
];

const BLOCK_LABEL: Record<string, string> = {
  video: "Video",
  faq: "FAQ",
  contact_form: "Formulir Kontak",
  maps: "Lokasi",
  text: "Teks",
  accordion: "Accordion",
  gallery: "Galeri Foto",
  audio: "Audio/Musik",
};

export type DesignSection = "blok" | "tema" | "header" | "tombol" | "font" | "stiker";

// ProdukPageEditor -- Modul Halaman Toko (permintaan langsung pengguna, 7
// Agustus 2026): "semua fitur yang ada di link bio" (builder blok/tautan +
// 4 panel desain Tema/Header/Tombol/Font + Stiker) dipakai ulang di SINI
// untuk halaman Toko auto (page_type="produk", slug=username -- lihat
// ensureProdukPage di page.go), sebagai tab pertama di menu Toko
// (dashboard/products). SENGAJA hanya mengelola Toko KANONIK (slug ===
// username) -- Toko ke-2..5 (Premium, multi-brand) tetap dikelola lewat
// dashboard/pages seperti sebelumnya.
//
// Donasi/Lead Capture/Social Proof/Poin Loyalitas SENGAJA TIDAK ada di sini
// -- account-wide (satu per akun, dikelola lewat menu masing-masing),
// bukan per-halaman.
//
// KOMPONEN TERKONTROL (bug ditemukan 8 Agustus 2026, audit responsif):
// sebelumnya komponen ini mengambil data & merender LivePreviewPanel-nya
// SENDIRI di dalam grid internal -- selain bikin dobel dengan pratinjau
// Bio di tab lain (sudah diperbaiki commit sebelumnya dengan menyembunyikan
// pratinjau Bio khusus tab ini), grid `1fr` di dalamnya juga tidak diberi
// min-w-0 (akar masalah overflow yang SAMA seperti yang pernah diperbaiki
// di dashboard/layout.tsx, lihat commit 08c1b78) sehingga bisa memaksa
// seluruh halaman melebar horizontal. Diperbaiki dengan mengangkat SEMUA
// pengambilan data & pratinjau ke induk (dashboard/products/page.tsx) --
// satu pratinjau Toko yang konsisten di SEMUA tab menu Produk, komponen
// ini sekarang murni konten kolom kiri (terkontrol lewat props).
export default function ProdukPageEditor({
  loading,
  username,
  page,
  setPage,
  links,
  setLinks,
  error,
  setError,
  creating,
  onCreateNow,
  onStickersChange,
  section,
  setSection,
}: {
  loading: boolean;
  username: string;
  page: ExtraPageDetail | null;
  setPage: (p: ExtraPageDetail) => void;
  links: LinkItem[];
  setLinks: (fn: (prev: LinkItem[]) => LinkItem[]) => void;
  error: string | null;
  setError: (msg: string | null) => void;
  creating: boolean;
  onCreateNow: () => void;
  onStickersChange: (stickers: PageStickerData[]) => void;
  // section/setSection -- diangkat ke induk (dashboard/products/page.tsx,
  // permintaan langsung pengguna: "langsung edit di bagian pratinjau nya")
  // supaya induk tahu tab Stiker sedang aktif atau tidak, untuk menyalakan
  // editableStickers di <LivePreviewPanel> miliknya sendiri -- pratinjau
  // Toko dirender di INDUK, bukan di komponen terkontrol ini.
  section: DesignSection;
  setSection: (s: DesignSection) => void;
}) {
  const router = useRouter();

  async function handlePatch(patch: Parameters<typeof updateExtraPage>[1]) {
    if (!page) return;
    const previous = page;
    setPage({ ...page, ...patch });
    try {
      await updateExtraPage(page.id, patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan.");
    }
  }

  // handleStyleOverride -- sama seperti useDesignData.ts: menyentuh panel
  // Tombol/Font TIDAK memaksa ganti `theme`, cuma menyalakan
  // custom_style_override supaya kustomisasi jadi lapisan independen di
  // atas tema apa pun (lihat catatan panjang di halaman utama).
  function handleStyleOverride(patch: Omit<Parameters<typeof updateExtraPage>[1], "theme" | "custom_style_override">) {
    return handlePatch({ ...patch, custom_style_override: true });
  }

  if (loading) return <PageSkeleton />;

  if (!page) {
    return (
      <div className="glass mx-auto max-w-xl rounded-2xl p-8 text-center shadow-card">
        <IconSparkle className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-3 font-heading text-lg font-bold text-ink">Halaman Toko belum aktif</h2>
        <p className="mt-2 text-sm text-muted">
          Halaman Toko-mu otomatis dibuat & dipublikasikan begitu kamu menambahkan produk pertama di tab Manage Items --
          tidak perlu langkah manual apa pun. Kalau mau menyiapkan bio/tema/blok-nya lebih awal, buat sekarang juga bisa,
          URL-nya selalu <span className="font-semibold text-ink">jeon.id/p/{username}</span>.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={onCreateNow}
          disabled={creating || !username}
          className="btn-primary mt-5 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {creating ? "Membuat..." : "Buat Halaman Toko sekarang"}
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <section className="glass rounded-2xl p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold text-ink">Halaman Toko</h2>
          <a
            href={`${SITE_URL}/p/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <IconExternal className="h-3.5 w-3.5" />
            jeon.id/p/{page.slug}
          </a>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${page.is_published ? "bg-secondary" : "bg-muted"}`} />
          <span className={`text-xs font-semibold ${page.is_published ? "text-secondary-dark" : "text-muted"}`}>
            {page.is_published ? "Sudah terbit" : "Belum terbit"}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Toggle checked={page.is_published} onChange={() => handlePatch({ is_published: !page.is_published })} label="Terbitkan halaman Toko" />
          <span className="text-sm font-semibold text-ink">Terbitkan halaman Toko</span>
        </div>
        {/* Modul Langganan Premium (permintaan langsung pengguna, 8 Agustus
            2026): toggle watermark yang SAMA seperti halaman Bio utama
            (lihat dashboard/design/page.tsx) -- kreator gratis dikunci
            (klik mengarahkan ke halaman upgrade), Premium bebas mengatur
            sendiri. Gerbang sungguhan tetap di backend. */}
        <div className="mt-3 flex items-center gap-2">
          <Toggle
            checked={page.is_premium && page.hide_watermark}
            disabled={!page.is_premium}
            onChange={() => handlePatch({ hide_watermark: !page.hide_watermark })}
            label="Sembunyikan watermark"
          />
          <button
            type="button"
            onClick={() => !page.is_premium && router.push("/dashboard/settings/subscription")}
            className="flex items-center gap-1 text-sm font-semibold text-ink"
          >
            Sembunyikan watermark
            {!page.is_premium && <IconLock className="h-3.5 w-3.5 text-muted" />}
          </button>
        </div>
        {/* Layout grid Produk -- permintaan langsung pengguna, 19 Agustus
            2026: "buat pilihan dua tipe layout product yang ditampilkan...
            1 product tampil memenuhi 1 baris jika ada 2 product berarti
            ada dibawah nya". Cuma relevan di sini (Halaman Toko) --
            grid Produk sudah tidak lagi dirender di halaman Bio sama
            sekali (lihat PagePreview.tsx).

            Opsi ketiga "category" -- susulan 20 Agustus 2026: "bagian
            produk bisa ga dibuat layout baru di kelompokan seperti ini,
            misal ada blok sepatu, baju, celana ketika di klik blok sepatu
            maka akan muncul semua product sepatu nya" -- blok per kategori,
            klik untuk drill-down (lihat renderProductGrid, PagePreview.tsx).
            Perbandingan aktif diubah jadi kesetaraan EKSPLISIT per opsi
            (bukan `!== "stacked"` seperti sebelumnya) supaya opsi ketiga ini
            tidak ikut salah ke-highlight sebagai "Grid 2 Kolom". */}
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">Tata Letak Produk</p>
          <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "grid" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                !page.product_layout || page.product_layout === "grid"
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border text-muted hover:text-ink"
              }`}
            >
              Grid 2 Kolom
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "stacked" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "stacked" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted hover:text-ink"
              }`}
            >
              1 Kolom Penuh
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "category" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "category" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted hover:text-ink"
              }`}
            >
              Blok Kategori
            </button>
          </div>
          {page.product_layout === "category" && (
            <p className="mt-1.5 text-[11px] text-muted">
              Pengunjung melihat blok kategori dulu (mis. Sepatu, Baju, Celana) -- klik satu blok untuk lihat semua produk di
              kategori itu. Pastikan produkmu sudah diberi kategori lewat menu Kelola supaya masuk ke blok yang tepat.
            </p>
          )}
        </div>
      </section>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mt-4 flex flex-wrap gap-1.5 rounded-2xl p-1.5 shadow-card">
        {(
          [
            ["blok", "Blok & Tautan"],
            ["tema", "Tema"],
            ["header", "Header"],
            ["tombol", "Tombol"],
            ["font", "Font"],
            ["stiker", "Stiker"],
          ] as [DesignSection, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              section === key ? "bg-primary-subtle text-primary" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {section === "blok" && (
          <BlockSection pageId={page.id} links={links} setLinks={setLinks} setError={setError} />
        )}
        {section === "tema" && <TemaSection page={page} isPremium={page.is_premium} onPatch={handlePatch} onError={setError} />}
        {section === "header" && <HeaderSection page={page} setPage={setPage} onPatch={handlePatch} onError={setError} />}
        {section === "tombol" && <TombolSection page={page} setPage={setPage} onStyleOverride={handleStyleOverride} />}
        {section === "font" && <FontSection page={page} setPage={setPage} onStyleOverride={handleStyleOverride} />}
        {section === "stiker" && (
          <section className="glass rounded-2xl p-5 shadow-card">
            <StickerCanvasEditor stickers={page.stickers} onChange={onStickersChange} />
          </section>
        )}
      </div>
    </div>
  );
}
// ---------- Blok & Tautan ----------

function BlockSection({
  pageId,
  links,
  setLinks,
  setError,
}: {
  pageId: string;
  links: LinkItem[];
  setLinks: (fn: (prev: LinkItem[]) => LinkItem[]) => void;
  setError: (msg: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [blockType, setBlockType] = useState<BlockType>("link");
  const [title, setTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [mapsEmbed, setMapsEmbed] = useState(true);
  const [text, setText] = useState("");
  // accordionText -- state TERPISAH dari `text` (walau block_data-nya sama
  // {text}) sama seperti dashboard/links/page.tsx: hindari isian nyasar
  // saat kreator ganti-ganti pilihan tipe blok sebelum submit.
  const [accordionText, setAccordionText] = useState("");
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([{ question: "", answer: "" }]);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // Blok "gallery"/"audio" (hasil analisa galeri tema kompetitor, 17
  // Agustus 2026): foto/audio diunggah SETELAH blok dibuat (lihat catatan
  // di CONTENT_TILES) -- id blok yang sedang mengunggah.
  const [galleryUploadingId, setGalleryUploadingId] = useState<string | null>(null);
  const [audioUploadingId, setAudioUploadingId] = useState<string | null>(null);

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
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah foto galeri.");
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
      setError(err instanceof ApiError ? err.message : "Gagal menghapus foto galeri.");
    }
  }

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
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah audio.");
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
      setError(err instanceof ApiError ? err.message : "Gagal menghapus audio.");
    }
  }

  function resetForm() {
    setTitle("");
    setLinkUrl("");
    setVideoUrl("");
    setMapsUrl("");
    setMapsEmbed(true);
    setText("");
    setAccordionText("");
    setFaqItems([{ question: "", answer: "" }]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Judul wajib diisi.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (blockType === "link") {
        if (!linkUrl.trim()) {
          setError("URL wajib diisi.");
          setSaving(false);
          return;
        }
        const created = await createExtraPageLink(pageId, { title: title.trim(), url: linkUrl.trim() });
        setLinks((prev) => [...prev, created]);
      } else {
        let blockData: Record<string, unknown> = {};
        let url: string | undefined;
        if (blockType === "video") {
          if (!videoUrl.trim()) {
            setError("Tautan video wajib diisi.");
            setSaving(false);
            return;
          }
          blockData = { video_url: videoUrl.trim() };
        } else if (blockType === "faq") {
          const items = faqItems.filter((it) => it.question.trim() && it.answer.trim());
          if (items.length === 0) {
            setError("Isi minimal 1 pertanyaan FAQ.");
            setSaving(false);
            return;
          }
          blockData = { items };
        } else if (blockType === "maps") {
          if (!mapsUrl.trim()) {
            setError("Tautan Google Maps wajib diisi.");
            setSaving(false);
            return;
          }
          url = mapsUrl.trim();
          blockData = { embed: mapsEmbed };
        } else if (blockType === "text") {
          if (!text.trim()) {
            setError("Isi teksnya dulu.");
            setSaving(false);
            return;
          }
          blockData = { text: text.trim() };
        } else if (blockType === "accordion") {
          if (!accordionText.trim()) {
            setError("Isi teks yang muncul saat diklik.");
            setSaving(false);
            return;
          }
          blockData = { text: accordionText.trim() };
        }
        const created = await createExtraPageBlock(pageId, { block_type: blockType, title: title.trim(), url, block_data: blockData });
        setLinks((prev) => [...prev, created]);
      }
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah blok.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menghapus.");
    }
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    setLinks((prev) => {
      const from = prev.findIndex((l) => l.id === dragId);
      const to = prev.findIndex((l) => l.id === targetId);
      if (from === -1 || to === -1) return prev;
      const reordered = [...prev];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const withPositions = reordered.map((l, idx) => ({ ...l, position: idx }));
      reorderExtraPageLinks(
        pageId,
        withPositions.map((l) => ({ id: l.id, position: l.position }))
      ).catch((err) => setError(err instanceof ApiError ? err.message : "Gagal menyimpan urutan."));
      return withPositions;
    });
    setDragId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="glass rounded-2xl p-5 shadow-card">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
            <IconPlus className="h-4 w-4" />
            Tambah Blok/Tautan
          </button>
        ) : (
          <form onSubmit={handleAdd} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {CONTENT_TILES.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => setBlockType(tile.key)}
                  title={tile.description}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                    blockType === tile.key ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
                  }`}
                >
                  <tile.Icon className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">{tile.label}</span>
                </button>
              ))}
            </div>

            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Judul"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />

            {blockType === "link" && (
              <input
                type="url"
                required
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "video" && (
              <input
                type="url"
                required
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Tautan YouTube/TikTok"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "maps" && (
              <>
                <input
                  type="url"
                  required
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  placeholder="Tautan Google Maps"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <input type="checkbox" checked={mapsEmbed} onChange={(e) => setMapsEmbed(e.target.checked)} />
                  Tampilkan tertanam (embed), bukan cuma tautan
                </label>
              </>
            )}
            {blockType === "text" && (
              <textarea
                required
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Isi teks..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "accordion" && (
              <textarea
                required
                rows={3}
                value={accordionText}
                onChange={(e) => setAccordionText(e.target.value)}
                placeholder="Isi teks yang muncul saat judul di atas diklik..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            )}
            {blockType === "faq" && (
              <div className="flex flex-col gap-2">
                {faqItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 rounded-lg border border-border p-2.5">
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, question: e.target.value } : it)))}
                      placeholder="Pertanyaan"
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                    <textarea
                      rows={2}
                      value={item.answer}
                      onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, answer: e.target.value } : it)))}
                      placeholder="Jawaban"
                      className="w-full rounded-md border border-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-semibold text-primary hover:underline"
                >
                  + Tambah pertanyaan
                </button>
              </div>
            )}
            {blockType === "contact_form" && (
              <p className="text-xs text-muted">Formulir siap pakai -- pengunjung isi nama/email/pesan, terkirim ke emailmu.</p>
            )}
            {(blockType === "gallery" || blockType === "audio") && (
              <p className="text-xs text-muted">
                {blockType === "gallery"
                  ? 'Buat blok dulu, foto ditambahkan setelahnya lewat panel "Kelola foto" di kartu blok.'
                  : 'Buat blok dulu, file audio diunggah setelahnya lewat panel "Kelola audio" di kartu blok.'}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60">
                {saving ? "Menyimpan..." : "Tambah"}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {links.length === 0 && <p className="text-center text-xs text-muted">Belum ada blok/tautan -- tambahkan lewat tombol di atas.</p>}
        {links.map((link) => (
          <div
            key={link.id}
            draggable
            onDragStart={() => setDragId(link.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(link.id)}
            className="flex flex-col gap-2.5 rounded-xl border border-border bg-white p-3 shadow-card"
          >
            <div className="flex items-center gap-2.5">
              <IconGripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {link.lock_type && <IconLock className="mr-1 inline h-3.5 w-3.5 text-muted" />}
                  {link.title}
                </p>
                <p className="truncate text-xs text-muted">
                  {link.block_type && link.block_type !== "link" ? BLOCK_LABEL[link.block_type] ?? link.block_type : link.url}
                </p>
              </div>
              <button type="button" onClick={() => handleDelete(link.id)} className="flex-shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600">
                <IconTrash className="h-4 w-4" />
              </button>
            </div>

            {/* Panel "Kelola foto"/"Kelola audio" -- hasil analisa galeri
                tema kompetitor, 17 Agustus 2026. SELALU tampil (bukan
                dibalik toggle) karena inti dari blok ini, sama seperti
                catatan di dashboard/links/page.tsx. */}
            {link.block_type === "gallery" && (
              <div className="ml-6 flex flex-col gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                <p className="text-[11px] font-semibold text-muted">
                  {(((link.block_data?.images as string[]) ?? []).length)}/{maxGalleryImages} foto
                </p>
                <div className="flex flex-wrap gap-2">
                  {((link.block_data?.images as string[]) ?? []).map((src, i) => (
                    <div key={i} className="group relative h-16 w-16 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
                      <button
                        type="button"
                        onClick={() => handleGalleryImageDelete(link, i)}
                        title="Hapus foto"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(((link.block_data?.images as string[]) ?? []).length) < maxGalleryImages && (
                    <label
                      className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border text-muted hover:border-primary hover:text-primary ${
                        galleryUploadingId === link.id ? "opacity-60" : ""
                      }`}
                    >
                      {galleryUploadingId === link.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                      ) : (
                        <>
                          <IconPlus className="h-4 w-4" />
                          <span className="text-[9px] font-semibold">Tambah</span>
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
            {link.block_type === "audio" && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-border bg-primary-subtle/30 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-muted">
                  {(link.block_data?.audio_url as string) ? "Audio terunggah." : "Belum ada audio (mp3/wav/m4a/ogg, maks 15MB)."}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-primary hover:text-primary">
                  {audioUploadingId === link.id ? "Mengunggah..." : (link.block_data?.audio_url as string) ? "Ganti" : "Unggah"}
                  <input
                    type="file"
                    accept=".mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                    onChange={(e) => handleAudioUpload(e, link)}
                    disabled={audioUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.audio_url as string) && (
                  <button type="button" onClick={() => handleAudioDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    Hapus
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Tema ----------

function TemaSection({
  page,
  isPremium,
  onPatch,
  onError,
}: {
  page: ExtraPageDetail;
  isPremium: boolean;
  onPatch: (patch: Parameters<typeof updateExtraPage>[1]) => void;
  onError: (msg: string | null) => void;
}) {
  const [bgUploading, setBgUploading] = useState(false);

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgUploading(true);
    try {
      await uploadExtraPageBackground(page.id, file);
      onPatch({});
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal mengunggah gambar latar.");
    } finally {
      setBgUploading(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5 shadow-card">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        <button type="button" onClick={() => (isPremium ? onPatch({ theme: "custom", custom_style_override: false }) : onError("Latar kustom khusus kreator Premium."))} className="group flex flex-col items-center gap-1.5">
          <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 ${page.theme === "custom" ? "ring-2 ring-primary ring-offset-2" : ""}`}>
            <div className="flex h-full w-full items-center justify-center bg-gray-100">
              <IconPaintbrush className="h-7 w-7 text-muted" />
            </div>
            {!isPremium && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <IconLock className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
          <span className="text-[11px] font-semibold text-ink">Custom{!isPremium && " (Premium)"}</span>
        </button>
        {THEME_PRESETS.map((themeName) => {
          const meta = PAGE_THEMES[themeName as keyof typeof PAGE_THEMES];
          if (!meta) return null;
          return (
            <button key={themeName} type="button" onClick={() => onPatch({ theme: themeName, custom_style_override: false })} className="group flex flex-col items-center gap-1.5">
              <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 ${page.theme === themeName ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                <div className="absolute inset-0" style={{ background: meta.previewBg }} aria-hidden />
                <span className={`absolute left-2.5 top-2 font-heading text-lg font-bold ${meta.previewIsDark ? "text-white" : "text-ink"}`} aria-hidden>
                  Aa
                </span>
                <span className={`absolute inset-x-2.5 bottom-2.5 h-5 rounded-full ring-1 ring-black/10 ${meta.buyButton}`} aria-hidden />
                {page.theme === themeName && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <IconCheck className="h-3 w-3" />
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-semibold ${page.theme === themeName ? "text-primary" : "text-ink"}`}>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {page.theme === "custom" && isPremium && (
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Latar Kustom</p>
          <div className="flex gap-2">
            {(["solid", "gradient", "image"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onPatch({ custom_background_type: t })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize ${
                  page.custom_background_type === t ? "border-primary bg-white text-primary" : "border-border text-muted"
                }`}
              >
                {t === "solid" ? "Warna" : t === "gradient" ? "Gradien" : "Gambar"}
              </button>
            ))}
          </div>
          {page.custom_background_type === "image" ? (
            <label className="cursor-pointer self-start rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary">
              {bgUploading ? "Mengunggah..." : "Unggah gambar latar"}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleBackgroundUpload} disabled={bgUploading} className="hidden" />
            </label>
          ) : (
            <input
              type={page.custom_background_type === "solid" ? "color" : "text"}
              value={page.custom_background_value || (page.custom_background_type === "solid" ? "#1B4D3E" : "")}
              onChange={(e) => onPatch({ custom_background_value: e.target.value })}
              placeholder={page.custom_background_type === "gradient" ? "linear-gradient(...)" : undefined}
              className="h-9 w-full rounded-lg border border-border px-3 text-sm"
            />
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Header ----------

function HeaderSection({
  page,
  setPage,
  onPatch,
  onError,
}: {
  page: ExtraPageDetail;
  setPage: (p: ExtraPageDetail) => void;
  onPatch: (patch: Parameters<typeof updateExtraPage>[1]) => void;
  onError: (msg: string | null) => void;
}) {
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Kontak sosial -- permintaan langsung pengguna, 11 Agustus 2026, paritas
  // penuh dengan halaman utama (dashboard/links/page.tsx): platform yang
  // sama, panel kolaps yang sama, disimpan lewat onPatch (updateExtraPage)
  // yang SAMA dengan field lain di section ini.
  const [socialOpen, setSocialOpen] = useState(false);
  const [socialDraft, setSocialDraft] = useState<Partial<Record<SocialPlatformKey, string>>>({});

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarUploading(true);
    try {
      const { avatar_url } = await uploadExtraPageAvatar(page.id, file);
      setPage({ ...page, avatar_url });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Gagal mengunggah foto profil.");
    } finally {
      setAvatarUploading(false);
    }
  }

  function openSocialPanel() {
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
    });
    setSocialOpen(true);
  }

  function saveSocial() {
    // onPatch (handlePatch di induk) sudah melakukan optimistic setPage +
    // try/catch + setError sendiri (pola sama seperti onBlur Nama/Bio di
    // atas) -- tidak diulang di sini supaya tidak ada dua sumber update
    // yang saling tabrakan.
    onPatch({
      social_instagram: (socialDraft.instagram ?? "").trim(),
      social_tiktok: (socialDraft.tiktok ?? "").trim(),
      social_facebook: (socialDraft.facebook ?? "").trim(),
      social_whatsapp: (socialDraft.whatsapp ?? "").trim(),
      social_youtube: (socialDraft.youtube ?? "").trim(),
      social_x: (socialDraft.x ?? "").trim(),
      social_linkedin: (socialDraft.linkedin ?? "").trim(),
      social_telegram: (socialDraft.telegram ?? "").trim(),
      social_email: (socialDraft.email ?? "").trim(),
    });
    setSocialOpen(false);
  }

  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Foto Profil Toko</label>
        <div className="flex items-center gap-3">
          {page.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.avatar_url} alt={page.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle font-heading text-base font-bold text-primary">
              {page.slug.slice(0, 1).toUpperCase()}
            </div>
          )}
          <label className="cursor-pointer rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary">
            {avatarUploading ? "Mengunggah..." : "Ganti Foto"}
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={avatarUploading} className="hidden" />
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Nama Tampilan</label>
        <input
          type="text"
          maxLength={100}
          value={page.display_name}
          onChange={(e) => setPage({ ...page, display_name: e.target.value })}
          onBlur={(e) => onPatch({ display_name: e.target.value })}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Bio (maks 160 karakter)</label>
        <textarea
          maxLength={160}
          rows={3}
          value={page.bio}
          onChange={(e) => setPage({ ...page, bio: e.target.value })}
          onBlur={(e) => onPatch({ bio: e.target.value })}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Layout -- paritas penuh dengan halaman utama (dashboard/design/
          header/page.tsx), lihat catatan lengkap di sana soal kenapa
          pemilih manual ini perlu ada. */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-ink">Layout</label>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LAYOUT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setPage({ ...page, layout_variant: opt.value });
                onPatch({ layout_variant: opt.value });
              }}
              className={`flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors ${
                page.layout_variant === opt.value ? "border-primary bg-primary-subtle" : "border-border bg-white hover:border-primary/50"
              }`}
            >
              <span className="text-[11px] font-bold text-ink">{opt.label}</span>
              <span className="text-[9px] leading-snug text-muted">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kontak Sosial -- permintaan langsung pengguna, 11 Agustus 2026,
          paritas penuh dengan halaman utama (lihat catatan lengkap di
          dashboard/links/page.tsx). */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => (socialOpen ? setSocialOpen(false) : openSocialPanel())}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-ink"
        >
          Kontak Sosial
          <IconChevronRight className={`h-3.5 w-3.5 text-muted transition-transform ${socialOpen ? "rotate-90" : ""}`} />
        </button>
        {socialOpen && (
          <div className="border-t border-border p-3">
            <div className="grid grid-cols-1 gap-2">
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
                    className="w-full min-w-0 rounded-lg border border-border px-2.5 py-2 text-xs text-ink focus:border-primary focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Isi handle saja (mis. &quot;username&quot;) atau tautan lengkap. Kosongkan untuk menyembunyikan ikonnya.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={saveSocial} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white">
                Simpan
              </button>
              <button type="button" onClick={() => setSocialOpen(false)} className="text-xs font-semibold text-muted hover:text-ink">
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------- Tombol ----------

function TombolSection({
  page,
  setPage,
  onStyleOverride,
}: {
  page: ExtraPageDetail;
  setPage: (p: ExtraPageDetail) => void;
  onStyleOverride: (patch: Omit<Parameters<typeof updateExtraPage>[1], "theme" | "custom_style_override">) => void;
}) {
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Tombol</label>
        <input
          type="color"
          value={page.custom_button_color}
          onChange={(e) => setPage({ ...page, custom_button_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_button_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-border"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Gaya Tombol</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_style: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_style === opt.value ? "border-primary bg-white text-primary" : "border-border text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Kelengkungan Sudut</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_ROUNDED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_rounded: opt.value })}
              title={opt.label}
              className={`flex h-9 flex-1 items-center justify-center border py-1.5 ${opt.className} ${
                page.custom_button_rounded === opt.value ? "border-primary bg-white" : "border-border"
              }`}
            >
              <span className={`block h-3 w-6 border-2 border-ink/60 ${opt.className}`} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Bayangan Tombol</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_SHADOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_shadow: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_shadow === opt.value ? "border-primary bg-white text-primary" : "border-border text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Font ----------

function FontSection({
  page,
  setPage,
  onStyleOverride,
}: {
  page: ExtraPageDetail;
  setPage: (p: ExtraPageDetail) => void;
  onStyleOverride: (patch: Omit<Parameters<typeof updateExtraPage>[1], "theme" | "custom_style_override">) => void;
}) {
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Font Halaman</label>
        <select
          value={page.custom_font}
          onChange={(e) => onStyleOverride({ custom_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Teks Halaman</label>
        <input
          type="color"
          value={page.custom_page_text_color || "#FFFFFF"}
          onChange={(e) => setPage({ ...page, custom_page_text_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_page_text_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-border"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-ink">Font Judul Terpisah</p>
          <p className="text-[11px] text-muted">Default sama dengan font halaman.</p>
        </div>
        <Toggle checked={!!page.custom_title_font} onChange={() => onStyleOverride({ custom_title_font: page.custom_title_font ? "" : page.custom_font })} label="Font judul terpisah" />
      </div>

      {page.custom_title_font && (
        <select
          value={page.custom_title_font}
          onChange={(e) => onStyleOverride({ custom_title_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Warna Judul</label>
        <input
          type="color"
          value={page.custom_title_color || "#FFFFFF"}
          onChange={(e) => setPage({ ...page, custom_title_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_title_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-border"
        />
      </div>
    </section>
  );
}

