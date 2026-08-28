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
  deleteFileBlock,
  deleteGalleryImage,
  deleteLink,
  reorderExtraPageLinks,
  updateExtraPage,
  uploadAudioBlock,
  uploadExtraPageAvatar,
  uploadExtraPageBackground,
  uploadFileBlock,
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
  IconFileText,
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
import { useLocale } from "@/lib/locale-context";

type BlockType = "link" | "video" | "faq" | "contact_form" | "maps" | "text" | "accordion" | "gallery" | "audio" | "file";

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
// getLayoutOptions/getContentTiles/getBlockLabel -- FUNGSI (bukan konstanta
// modul lagi), pola sama seperti buildNavItems/buildExtraPageLabels di
// dashboard/layout.tsx (Modul Pilihan Bahasa EN/ID, 29 Agustus 2026): label
// lewat t()/dict supaya ikut berganti begitu locale berubah, dipanggil ULANG
// tiap render di dalam komponen yang memakainya. Nilai label short-name
// (Centered/Banner/dst, Video/FAQ/Accordion) SENGAJA dibiarkan sama di
// id/en (nama gaya/tipe blok, bukan kalimat) -- cuma deskripsinya yang
// benar-benar diterjemahkan.
function getLayoutOptions(t: (key: string) => string): { value: MyPage["layout_variant"]; label: string; description: string }[] {
  return [
    { value: "centered", label: "Centered", description: t("dashboard.components.produkPageEditor.layoutOptions.centered") },
    { value: "banner", label: "Banner", description: t("dashboard.components.produkPageEditor.layoutOptions.banner") },
    { value: "card", label: "Card", description: t("dashboard.components.produkPageEditor.layoutOptions.card") },
    { value: "spotlight", label: "Spotlight", description: t("dashboard.components.produkPageEditor.layoutOptions.spotlight") },
    { value: "cover", label: "Cover", description: t("dashboard.components.produkPageEditor.layoutOptions.cover") },
    { value: "minimal", label: "Minimal", description: t("dashboard.components.produkPageEditor.layoutOptions.minimal") },
    { value: "hero", label: "Hero", description: t("dashboard.components.produkPageEditor.layoutOptions.hero") },
    { value: "polaroid", label: "Polaroid", description: t("dashboard.components.produkPageEditor.layoutOptions.polaroid") },
    { value: "split", label: "Split", description: t("dashboard.components.produkPageEditor.layoutOptions.split") },
    { value: "ticket", label: "Ticket", description: t("dashboard.components.produkPageEditor.layoutOptions.ticket") },
    { value: "headline", label: "Headline", description: t("dashboard.components.produkPageEditor.layoutOptions.headline") },
    { value: "ribbon", label: "Ribbon", description: t("dashboard.components.produkPageEditor.layoutOptions.ribbon") },
    { value: "duo", label: "Duo", description: t("dashboard.components.produkPageEditor.layoutOptions.duo") },
    { value: "masthead", label: "Masthead", description: t("dashboard.components.produkPageEditor.layoutOptions.masthead") },
    { value: "portrait", label: "Portrait", description: t("dashboard.components.produkPageEditor.layoutOptions.portrait") },
  ];
}

function getContentTiles(
  t: (key: string) => string
): { key: BlockType; label: string; description: string; Icon: (p: { className?: string }) => React.ReactElement }[] {
  return [
    { key: "link", label: t("dashboard.components.produkPageEditor.contentTiles.link.label"), description: t("dashboard.components.produkPageEditor.contentTiles.link.desc"), Icon: IconLink },
    { key: "video", label: t("dashboard.components.produkPageEditor.contentTiles.video.label"), description: t("dashboard.components.produkPageEditor.contentTiles.video.desc"), Icon: IconPlayCircle },
    { key: "faq", label: t("dashboard.components.produkPageEditor.contentTiles.faq.label"), description: t("dashboard.components.produkPageEditor.contentTiles.faq.desc"), Icon: IconBook },
    // "accordion" -- permintaan langsung pengguna: "blok yang bisa diklik
    // lalu keluar text, bukan hanya untuk faq saja" -- lihat catatan lengkap
    // di dashboard/links/page.tsx (pola sama persis, dipakai ulang di sini
    // untuk paritas halaman utama/Toko).
    { key: "accordion", label: t("dashboard.components.produkPageEditor.contentTiles.accordion.label"), description: t("dashboard.components.produkPageEditor.contentTiles.accordion.desc"), Icon: IconChevronRight },
    { key: "contact_form", label: t("dashboard.components.produkPageEditor.contentTiles.contactForm.label"), description: t("dashboard.components.produkPageEditor.contentTiles.contactForm.desc"), Icon: IconMail },
    { key: "maps", label: t("dashboard.components.produkPageEditor.contentTiles.maps.label"), description: t("dashboard.components.produkPageEditor.contentTiles.maps.desc"), Icon: IconMapPin },
    { key: "text", label: t("dashboard.components.produkPageEditor.contentTiles.text.label"), description: t("dashboard.components.produkPageEditor.contentTiles.text.desc"), Icon: IconTextLines },
    // "gallery"/"audio" -- hasil analisa galeri tema kompetitor, 17 Agustus
    // 2026, lihat catatan lengkap di dashboard/links/page.tsx (pola sama
    // persis, dipakai ulang di sini untuk paritas halaman utama/Toko).
    { key: "gallery", label: t("dashboard.components.produkPageEditor.contentTiles.gallery.label"), description: t("dashboard.components.produkPageEditor.contentTiles.gallery.desc"), Icon: IconPhotoLibrary },
    { key: "audio", label: t("dashboard.components.produkPageEditor.contentTiles.audio.label"), description: t("dashboard.components.produkPageEditor.contentTiles.audio.desc"), Icon: IconMusicNote },
    // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
    // file pdf download", lihat catatan lengkap di dashboard/links/page.tsx
    // (pola sama persis, dipakai ulang di sini untuk paritas halaman
    // utama/Toko).
    { key: "file", label: t("dashboard.components.produkPageEditor.contentTiles.file.label"), description: t("dashboard.components.produkPageEditor.contentTiles.file.desc"), Icon: IconFileText },
  ];
}

function getBlockLabel(t: (key: string) => string): Record<string, string> {
  return {
    video: t("dashboard.components.produkPageEditor.contentTiles.video.label"),
    faq: t("dashboard.components.produkPageEditor.contentTiles.faq.label"),
    contact_form: t("dashboard.components.produkPageEditor.contentTiles.contactForm.label"),
    maps: t("dashboard.components.produkPageEditor.contentTiles.maps.label"),
    text: t("dashboard.components.produkPageEditor.contentTiles.text.label"),
    accordion: t("dashboard.components.produkPageEditor.contentTiles.accordion.label"),
    gallery: t("dashboard.components.produkPageEditor.contentTiles.gallery.label"),
    audio: t("dashboard.components.produkPageEditor.contentTiles.audio.label"),
    file: t("dashboard.components.produkPageEditor.contentTiles.file.label"),
  };
}

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
  const { t } = useLocale();

  async function handlePatch(patch: Parameters<typeof updateExtraPage>[1]) {
    if (!page) return;
    const previous = page;
    setPage({ ...page, ...patch });
    try {
      await updateExtraPage(page.id, patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveSettings"));
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
        <h2 className="mt-3 font-heading text-lg font-bold text-app-ink">{t("dashboard.components.produkPageEditor.notActive.title")}</h2>
        <p className="mt-2 text-sm text-app-muted">
          {t("dashboard.components.produkPageEditor.notActive.description")}{" "}
          <span className="font-semibold text-app-ink">jeon.id/{username}/{username}</span>.
        </p>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={onCreateNow}
          disabled={creating || !username}
          className="btn-primary mt-5 rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {creating ? t("dashboard.components.produkPageEditor.notActive.creating") : t("dashboard.components.produkPageEditor.notActive.createNow")}
        </button>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <section className="glass rounded-2xl p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold text-app-ink">{t("dashboard.components.produkPageEditor.pageTitle")}</h2>
          <a
            href={`${SITE_URL}/${username}/${page.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <IconExternal className="h-3.5 w-3.5" />
            jeon.id/{username}/{page.slug}
          </a>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${page.is_published ? "bg-secondary" : "bg-muted"}`} />
          <span className={`text-xs font-semibold ${page.is_published ? "text-secondary-dark" : "text-app-muted"}`}>
            {page.is_published ? t("dashboard.components.produkPageEditor.published") : t("dashboard.components.produkPageEditor.notPublished")}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Toggle
            checked={page.is_published}
            onChange={() => handlePatch({ is_published: !page.is_published })}
            label={t("dashboard.components.produkPageEditor.publishToggle")}
          />
          <span className="text-sm font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.publishToggle")}</span>
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
            label={t("dashboard.components.produkPageEditor.hideWatermark")}
          />
          <button
            type="button"
            onClick={() => !page.is_premium && router.push("/dashboard/settings/subscription")}
            className="flex items-center gap-1 text-sm font-semibold text-app-ink"
          >
            {t("dashboard.components.produkPageEditor.hideWatermark")}
            {!page.is_premium && <IconLock className="h-3.5 w-3.5 text-app-muted" />}
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
          <p className="text-sm font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.productLayout.title")}</p>
          <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "grid" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                !page.product_layout || page.product_layout === "grid"
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.grid")}
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "stacked" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "stacked" ? "border-primary bg-primary-subtle text-primary" : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.stacked")}
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "category" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "category" ? "border-primary bg-primary-subtle text-primary" : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.category")}
            </button>
          </div>
          {page.product_layout === "category" && (
            <p className="mt-1.5 text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.productLayout.categoryHint")}</p>
          )}
        </div>
      </section>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="glass mt-4 flex flex-wrap gap-1.5 rounded-2xl p-1.5 shadow-card">
        {(
          [
            ["blok", t("dashboard.components.produkPageEditor.designTabs.blok")],
            ["tema", t("dashboard.components.produkPageEditor.designTabs.tema")],
            ["header", t("dashboard.components.produkPageEditor.designTabs.header")],
            ["tombol", t("dashboard.components.produkPageEditor.designTabs.tombol")],
            ["font", t("dashboard.components.produkPageEditor.designTabs.font")],
            ["stiker", t("dashboard.components.produkPageEditor.designTabs.stiker")],
          ] as [DesignSection, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold ${
              section === key ? "bg-primary-subtle text-primary" : "text-app-muted hover:text-app-ink"
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

// FormField -- permintaan langsung pengguna, 27 Agustus 2026: "perbaiki ui
// dan ux semua blok yang ada di link bio dan juga toko seperti kasih label
// url atau desc dsb" -- field bertumpuk (mis. Judul lalu Tautan) tanpa
// label bikin bingung mana yang teks tampil vs mana yang URL tujuan,
// terutama setelah field terisi (placeholder hilang begitu ada teks).
// Disalin APA ADANYA dari dashboard/links/page.tsx (BUKAN diimpor dari satu
// sumber) -- konsisten dengan pola "dua jalur kode berbeda" yang sudah
// dipakai proyek ini untuk paritas halaman utama/Toko (lihat catatan
// LAYOUT_OPTIONS di atas). label dibungkus DI DALAM <label> (asosiasi a11y
// otomatis, tanpa id/htmlFor manual, juga kebaca getByLabel() di test) --
// hint SENGAJA di LUAR <label> supaya prosa hint tidak ikut masuk ke nama
// aksesibel elemen (kalau hint kebetulan memuat kata yang sama dengan
// label lain, getByLabel() bisa salah tangkap).
function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-app-muted">{label}</span>
        {children}
      </label>
      {hint && <p className="text-[10.5px] text-app-muted">{hint}</p>}
    </div>
  );
}

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
  const { t } = useLocale();
  const CONTENT_TILES = getContentTiles(t);
  const BLOCK_LABEL = getBlockLabel(t);
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
  // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download", pola sama seperti galleryUploadingId/audioUploadingId.
  const [fileUploadingId, setFileUploadingId] = useState<string | null>(null);

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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadGalleryImage"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteGalleryImage"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadAudio"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteAudio"));
    }
  }

  // "file" -- permintaan langsung pengguna, 20 Agustus 2026: "tambahkan
  // file pdf download", pola sama seperti handleAudioUpload/handleAudioDelete.
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadFile"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteFile"));
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
      setError(t("dashboard.components.produkPageEditor.errors.titleRequired"));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      if (blockType === "link") {
        if (!linkUrl.trim()) {
          setError(t("dashboard.components.produkPageEditor.errors.urlRequired"));
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
            setError(t("dashboard.components.produkPageEditor.errors.videoUrlRequired"));
            setSaving(false);
            return;
          }
          blockData = { video_url: videoUrl.trim() };
        } else if (blockType === "faq") {
          const items = faqItems.filter((it) => it.question.trim() && it.answer.trim());
          if (items.length === 0) {
            setError(t("dashboard.components.produkPageEditor.errors.faqItemRequired"));
            setSaving(false);
            return;
          }
          blockData = { items };
        } else if (blockType === "maps") {
          if (!mapsUrl.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.mapsUrlRequired"));
            setSaving(false);
            return;
          }
          url = mapsUrl.trim();
          blockData = { embed: mapsEmbed };
        } else if (blockType === "text") {
          if (!text.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.textRequired"));
            setSaving(false);
            return;
          }
          blockData = { text: text.trim() };
        } else if (blockType === "accordion") {
          if (!accordionText.trim()) {
            setError(t("dashboard.components.produkPageEditor.errors.accordionTextRequired"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.addBlock"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    try {
      await deleteLink(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.deleteBlock"));
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
      ).catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.saveOrder")));
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
            {t("dashboard.components.produkPageEditor.addBlockButton")}
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
                    blockType === tile.key ? "border-primary bg-primary-subtle text-primary" : "border-app-border text-app-muted"
                  }`}
                >
                  <tile.Icon className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">{tile.label}</span>
                </button>
              ))}
            </div>

            <FormField
              label={
                blockType === "link"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleLabel")
                  : t("dashboard.components.produkPageEditor.blockForm.blockTitleLabel")
              }
              hint={
                blockType === "link"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintLink")
                  : blockType === "text"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintText")
                  : blockType === "accordion"
                  ? t("dashboard.components.produkPageEditor.blockForm.titleHintAccordion")
                  : undefined
              }
            >
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("dashboard.components.produkPageEditor.blockForm.titlePlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </FormField>

            {blockType === "link" && (
              <FormField
                label={t("dashboard.components.produkPageEditor.blockForm.urlLabel")}
                hint={t("dashboard.components.produkPageEditor.blockForm.urlHint")}
              >
                <input
                  type="url"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "video" && (
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.videoUrlLabel")}>
                <input
                  type="url"
                  required
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder={t("dashboard.components.produkPageEditor.blockForm.videoUrlPlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "maps" && (
              <>
                <FormField label={t("dashboard.components.produkPageEditor.blockForm.mapsUrlLabel")}>
                  <input
                    type="url"
                    required
                    value={mapsUrl}
                    onChange={(e) => setMapsUrl(e.target.value)}
                    placeholder={t("dashboard.components.produkPageEditor.blockForm.mapsUrlLabel")}
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </FormField>
                <label className="flex items-center gap-2 text-xs font-semibold text-app-ink">
                  <input type="checkbox" checked={mapsEmbed} onChange={(e) => setMapsEmbed(e.target.checked)} />
                  {t("dashboard.components.produkPageEditor.blockForm.mapsEmbedCheckbox")}
                </label>
              </>
            )}
            {blockType === "text" && (
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.textLabel")}>
                <textarea
                  required
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("dashboard.components.produkPageEditor.blockForm.textPlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "accordion" && (
              <FormField label={t("dashboard.components.produkPageEditor.blockForm.accordionTextLabel")}>
                <textarea
                  required
                  rows={3}
                  value={accordionText}
                  onChange={(e) => setAccordionText(e.target.value)}
                  placeholder={t("dashboard.components.produkPageEditor.blockForm.accordionTextPlaceholder")}
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </FormField>
            )}
            {blockType === "faq" && (
              <div className="flex flex-col gap-2">
                {faqItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1.5 rounded-lg border border-app-border p-2.5">
                    <FormField label={t("dashboard.components.produkPageEditor.blockForm.faqQuestionLabel").replace("{index}", String(idx + 1))}>
                      <input
                        type="text"
                        value={item.question}
                        onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, question: e.target.value } : it)))}
                        placeholder={t("dashboard.components.produkPageEditor.blockForm.faqQuestionPlaceholder")}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.components.produkPageEditor.blockForm.faqAnswerLabel")}>
                      <textarea
                        rows={2}
                        value={item.answer}
                        onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, answer: e.target.value } : it)))}
                        placeholder={t("dashboard.components.produkPageEditor.blockForm.faqAnswerLabel")}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                    </FormField>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-semibold text-primary hover:underline"
                >
                  {t("dashboard.components.produkPageEditor.blockForm.addFaqQuestion")}
                </button>
              </div>
            )}
            {blockType === "contact_form" && (
              <p className="text-xs text-app-muted">{t("dashboard.components.produkPageEditor.blockForm.contactFormHint")}</p>
            )}
            {(blockType === "gallery" || blockType === "audio" || blockType === "file") && (
              <p className="text-xs text-app-muted">
                {blockType === "gallery"
                  ? t("dashboard.components.produkPageEditor.blockForm.galleryHint")
                  : blockType === "audio"
                  ? t("dashboard.components.produkPageEditor.blockForm.audioHint")
                  : t("dashboard.components.produkPageEditor.blockForm.fileHint")}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-app-border py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.components.produkPageEditor.blockForm.cancel")}
              </button>
              <button type="submit" disabled={saving} className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60">
                {saving ? t("dashboard.components.produkPageEditor.blockForm.saving") : t("dashboard.components.produkPageEditor.blockForm.add")}
              </button>
            </div>
          </form>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {links.length === 0 && (
          <p className="text-center text-xs text-app-muted">{t("dashboard.components.produkPageEditor.blockForm.emptyState")}</p>
        )}
        {links.map((link) => (
          <div
            key={link.id}
            draggable
            onDragStart={() => setDragId(link.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(link.id)}
            className="flex flex-col gap-2.5 rounded-xl border border-app-border bg-app-surface p-3 shadow-card"
          >
            <div className="flex items-center gap-2.5">
              <IconGripVertical className="h-4 w-4 flex-shrink-0 cursor-grab text-app-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-app-ink">
                  {link.lock_type && <IconLock className="mr-1 inline h-3.5 w-3.5 text-app-muted" />}
                  {link.title}
                </p>
                <p className="truncate text-xs text-app-muted">
                  {link.block_type && link.block_type !== "link" ? BLOCK_LABEL[link.block_type] ?? link.block_type : link.url}
                </p>
              </div>
              <button type="button" onClick={() => handleDelete(link.id)} className="flex-shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-red-50 hover:text-red-600">
                <IconTrash className="h-4 w-4" />
              </button>
            </div>

            {/* Panel "Kelola foto"/"Kelola audio" -- hasil analisa galeri
                tema kompetitor, 17 Agustus 2026. SELALU tampil (bukan
                dibalik toggle) karena inti dari blok ini, sama seperti
                catatan di dashboard/links/page.tsx. */}
            {link.block_type === "gallery" && (
              <div className="ml-6 flex flex-col gap-2 rounded-lg border border-app-border bg-primary-subtle/30 p-2.5">
                <p className="text-[11px] font-semibold text-app-muted">
                  {t("dashboard.components.produkPageEditor.blockForm.galleryCount")
                    .replace("{count}", String(((link.block_data?.images as string[]) ?? []).length))
                    .replace("{max}", String(maxGalleryImages))}
                </p>
                <div className="flex flex-wrap gap-2">
                  {((link.block_data?.images as string[]) ?? []).map((src, i) => (
                    <div key={i} className="group relative h-16 w-16 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full rounded-md object-cover ring-1 ring-black/5" />
                      <button
                        type="button"
                        onClick={() => handleGalleryImageDelete(link, i)}
                        title={t("dashboard.components.produkPageEditor.blockForm.deletePhoto")}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
                      >
                        <IconX className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {(((link.block_data?.images as string[]) ?? []).length) < maxGalleryImages && (
                    <label
                      className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-primary hover:text-primary ${
                        galleryUploadingId === link.id ? "opacity-60" : ""
                      }`}
                    >
                      {galleryUploadingId === link.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                      ) : (
                        <>
                          <IconPlus className="h-4 w-4" />
                          <span className="text-[9px] font-semibold">{t("dashboard.components.produkPageEditor.blockForm.add")}</span>
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
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-primary-subtle/30 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.audio_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.audioUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.audioEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border border-app-border bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-primary hover:text-primary">
                  {audioUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.audio_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.replace")
                    : t("dashboard.components.produkPageEditor.blockForm.upload")}
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
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
                  </button>
                )}
              </div>
            )}
            {/* Panel "Kelola file" -- blok "file" (permintaan langsung
                pengguna, 20 Agustus 2026: "tambahkan file pdf download"),
                pola sama persis seperti panel Kelola audio di atas. */}
            {link.block_type === "file" && (
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-primary-subtle/30 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.file_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.fileUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.fileEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border border-app-border bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-primary hover:text-primary">
                  {fileUploadingId === link.id
                    ? t("dashboard.components.produkPageEditor.blockForm.uploading")
                    : (link.block_data?.file_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.replace")
                    : t("dashboard.components.produkPageEditor.blockForm.upload")}
                  <input
                    type="file"
                    accept=".pdf,.zip,.epub,application/pdf,application/zip,application/epub+zip"
                    onChange={(e) => handleFileUpload(e, link)}
                    disabled={fileUploadingId === link.id}
                    className="hidden"
                  />
                </label>
                {(link.block_data?.file_url as string) && (
                  <button type="button" onClick={() => handleFileDelete(link)} className="flex-shrink-0 text-[11px] font-semibold text-red-600 hover:underline">
                    {t("dashboard.components.produkPageEditor.blockForm.delete")}
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
  const { t } = useLocale();
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
      onError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadBackground"));
    } finally {
      setBgUploading(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5 shadow-card">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            isPremium
              ? onPatch({ theme: "custom", custom_style_override: false })
              : onError(t("dashboard.components.produkPageEditor.tema.customPremiumOnly"))
          }
          className="group flex flex-col items-center gap-1.5"
        >
          <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 ${page.theme === "custom" ? "ring-2 ring-primary ring-offset-2" : ""}`}>
            <div className="flex h-full w-full items-center justify-center bg-gray-100">
              <IconPaintbrush className="h-7 w-7 text-app-muted" />
            </div>
            {!isPremium && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <IconLock className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
          <span className="text-[11px] font-semibold text-app-ink">
            {t("dashboard.components.produkPageEditor.tema.customLabel")}
            {!isPremium && ` (${t("dashboard.components.produkPageEditor.tema.premiumSuffix")})`}
          </span>
        </button>
        {THEME_PRESETS.map((themeName) => {
          const meta = PAGE_THEMES[themeName as keyof typeof PAGE_THEMES];
          if (!meta) return null;
          return (
            <button key={themeName} type="button" onClick={() => onPatch({ theme: themeName, custom_style_override: false })} className="group flex flex-col items-center gap-1.5">
              <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl ring-1 ring-black/5 ${page.theme === themeName ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                <div className="absolute inset-0" style={{ background: meta.previewBg }} aria-hidden />
                <span className={`absolute left-2.5 top-2 font-heading text-lg font-bold ${meta.previewIsDark ? "text-white" : "text-app-ink"}`} aria-hidden>
                  Aa
                </span>
                <span className={`absolute inset-x-2.5 bottom-2.5 h-5 rounded-full ring-1 ring-black/10 ${meta.buyButton}`} aria-hidden />
                {page.theme === themeName && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <IconCheck className="h-3 w-3" />
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-semibold ${page.theme === themeName ? "text-primary" : "text-app-ink"}`}>{meta.label}</span>
            </button>
          );
        })}
      </div>

      {page.theme === "custom" && isPremium && (
        <div className="mt-5 flex flex-col gap-3 border-t border-app-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-app-muted">{t("dashboard.components.produkPageEditor.tema.customBackground")}</p>
          <div className="flex gap-2">
            {(["solid", "gradient", "image"] as const).map((bgType) => (
              <button
                key={bgType}
                type="button"
                onClick={() => onPatch({ custom_background_type: bgType })}
                className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold capitalize ${
                  page.custom_background_type === bgType ? "border-primary bg-app-surface text-primary" : "border-app-border text-app-muted"
                }`}
              >
                {bgType === "solid"
                  ? t("dashboard.components.produkPageEditor.tema.backgroundColor")
                  : bgType === "gradient"
                  ? t("dashboard.components.produkPageEditor.tema.backgroundGradient")
                  : t("dashboard.components.produkPageEditor.tema.backgroundImage")}
              </button>
            ))}
          </div>
          {page.custom_background_type === "image" ? (
            <label className="cursor-pointer self-start rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-primary hover:text-primary">
              {bgUploading ? t("dashboard.components.produkPageEditor.tema.uploading") : t("dashboard.components.produkPageEditor.tema.uploadBackground")}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleBackgroundUpload} disabled={bgUploading} className="hidden" />
            </label>
          ) : (
            <input
              type={page.custom_background_type === "solid" ? "color" : "text"}
              value={page.custom_background_value || (page.custom_background_type === "solid" ? "#1B4D3E" : "")}
              onChange={(e) => onPatch({ custom_background_value: e.target.value })}
              placeholder={page.custom_background_type === "gradient" ? "linear-gradient(...)" : undefined}
              className="h-9 w-full rounded-lg border border-app-border px-3 text-sm"
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
  const { t } = useLocale();
  const LAYOUT_OPTIONS = getLayoutOptions(t);
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
      onError(err instanceof ApiError ? err.message : t("dashboard.components.produkPageEditor.errors.uploadAvatar"));
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
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.avatarLabel")}</label>
        <div className="flex items-center gap-3">
          {page.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.avatar_url} alt={page.name} className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle font-heading text-base font-bold text-primary">
              {page.slug.slice(0, 1).toUpperCase()}
            </div>
          )}
          <label className="cursor-pointer rounded-lg border border-app-border bg-app-surface px-3 py-1.5 text-xs font-semibold text-app-ink hover:border-primary hover:text-primary">
            {avatarUploading ? t("dashboard.components.produkPageEditor.header.uploading") : t("dashboard.components.produkPageEditor.header.changePhoto")}
            <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleAvatarChange} disabled={avatarUploading} className="hidden" />
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.displayNameLabel")}</label>
        <input
          type="text"
          maxLength={100}
          value={page.display_name}
          onChange={(e) => setPage({ ...page, display_name: e.target.value })}
          onBlur={(e) => onPatch({ display_name: e.target.value })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.bioLabel")}</label>
        <textarea
          maxLength={160}
          rows={3}
          value={page.bio}
          onChange={(e) => setPage({ ...page, bio: e.target.value })}
          onBlur={(e) => onPatch({ bio: e.target.value })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {/* Layout -- paritas penuh dengan halaman utama (dashboard/design/
          header/page.tsx), lihat catatan lengkap di sana soal kenapa
          pemilih manual ini perlu ada. */}
      <div>
        <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.header.layoutLabel")}</label>
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
                page.layout_variant === opt.value ? "border-primary bg-primary-subtle" : "border-app-border bg-app-surface hover:border-primary/50"
              }`}
            >
              <span className="text-[11px] font-bold text-app-ink">{opt.label}</span>
              <span className="text-[9px] leading-snug text-app-muted">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kontak Sosial -- permintaan langsung pengguna, 11 Agustus 2026,
          paritas penuh dengan halaman utama (lihat catatan lengkap di
          dashboard/links/page.tsx). */}
      <div className="rounded-xl border border-app-border">
        <button
          type="button"
          onClick={() => (socialOpen ? setSocialOpen(false) : openSocialPanel())}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-app-ink"
        >
          {t("dashboard.components.produkPageEditor.header.socialContact")}
          <IconChevronRight className={`h-3.5 w-3.5 text-app-muted transition-transform ${socialOpen ? "rotate-90" : ""}`} />
        </button>
        {socialOpen && (
          <div className="border-t border-app-border p-3">
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
                    aria-label={p.label}
                    className="w-full min-w-0 rounded-lg border border-app-border px-2.5 py-2 text-xs text-app-ink focus:border-primary focus:outline-none"
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.header.socialHint")}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={saveSocial} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white">
                {t("dashboard.components.produkPageEditor.header.save")}
              </button>
              <button type="button" onClick={() => setSocialOpen(false)} className="text-xs font-semibold text-app-muted hover:text-app-ink">
                {t("dashboard.components.produkPageEditor.header.cancel")}
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
  const { t } = useLocale();
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonColor")}</label>
        <input
          type="color"
          value={page.custom_button_color}
          onChange={(e) => setPage({ ...page, custom_button_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_button_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonStyle")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_style: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_style === opt.value ? "border-primary bg-app-surface text-primary" : "border-app-border text-app-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.cornerRadius")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_ROUNDED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_rounded: opt.value })}
              title={opt.label}
              className={`flex h-9 flex-1 items-center justify-center border py-1.5 ${opt.className} ${
                page.custom_button_rounded === opt.value ? "border-primary bg-app-surface" : "border-app-border"
              }`}
            >
              <span className={`block h-3 w-6 border-2 border-ink/60 ${opt.className}`} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.tombol.buttonShadow")}</label>
        <div className="flex gap-2">
          {CUSTOM_BUTTON_SHADOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onStyleOverride({ custom_button_shadow: opt.value })}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold ${
                page.custom_button_shadow === opt.value ? "border-primary bg-app-surface text-primary" : "border-app-border text-app-muted"
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
  const { t } = useLocale();
  return (
    <section className="glass flex flex-col gap-4 rounded-2xl p-5 shadow-card">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.pageFont")}</label>
        <select
          value={page.custom_font}
          onChange={(e) => onStyleOverride({ custom_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.pageTextColor")}</label>
        <input
          type="color"
          value={page.custom_page_text_color || "#FFFFFF"}
          onChange={(e) => setPage({ ...page, custom_page_text_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_page_text_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.separateTitleFont")}</p>
          <p className="text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.font.separateTitleFontHint")}</p>
        </div>
        <Toggle
          checked={!!page.custom_title_font}
          onChange={() => onStyleOverride({ custom_title_font: page.custom_title_font ? "" : page.custom_font })}
          label={t("dashboard.components.produkPageEditor.font.separateTitleFont")}
        />
      </div>

      {page.custom_title_font && (
        <select
          value={page.custom_title_font}
          onChange={(e) => onStyleOverride({ custom_title_font: e.target.value as MyPage["custom_font"] })}
          className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-primary focus:outline-none"
        >
          {CUSTOM_FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.components.produkPageEditor.font.titleColor")}</label>
        <input
          type="color"
          value={page.custom_title_color || "#FFFFFF"}
          onChange={(e) => setPage({ ...page, custom_title_color: e.target.value })}
          onBlur={(e) => onStyleOverride({ custom_title_color: e.target.value })}
          className="h-9 w-full rounded-lg border border-app-border"
        />
      </div>
    </section>
  );
}

