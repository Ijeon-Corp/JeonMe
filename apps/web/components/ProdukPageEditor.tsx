"use client";

import PageSkeleton from "@/components/Skeleton";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  ExtraPageDetail,
  LinkItem,
  PageStickerData,
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
  IconBook,
  IconChevronRight,
  IconExternal,
  IconFileText,
  IconGripVertical,
  IconLink,
  IconLock,
  IconMail,
  IconMapPin,
  IconMusicNote,
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
import SectionCard from "@/components/dashboard/page/SectionCard";
import DesignCategoryTabs from "@/components/dashboard/page/DesignCategoryTabs";
import { DesignSectionPatch, FontSection, HeaderSection, TemaSection, TombolSection } from "@/components/dashboard/page/design-sections";
import { SITE_URL } from "@/lib/site";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

type BlockType = "link" | "video" | "faq" | "contact_form" | "maps" | "text" | "accordion" | "gallery" | "audio" | "file";

// maxGalleryImages -- SAMA PERSIS dengan batas backend (links.go).
const maxGalleryImages = 9;

// getContentTiles/getBlockLabel -- FUNGSI (bukan konstanta modul lagi),
// pola sama seperti buildNavItems/buildExtraPageLabels di dashboard/
// layout.tsx (Modul Pilihan Bahasa EN/ID, 29 Agustus 2026): label lewat
// t()/dict supaya ikut berganti begitu locale berubah, dipanggil ULANG
// tiap render di dalam komponen yang memakainya.
// (getLayoutOptions -- dipakai HeaderSection -- pindah ke
// components/dashboard/page/design-sections.tsx bersama HeaderSection
// sendiri, permintaan langsung pengguna 9 September 2026 "design langsung
// di builder juga".)
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
  useErrorToast(error);

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

  // handleDesignLocalChange/handleUploadAvatar/handleUploadBackground --
  // adapter Tema/Header/Tombol/Font (components/dashboard/page/design-
  // sections.tsx, diekstrak dari sini 9 September 2026, "design langsung di
  // builder juga"): komponen bersama itu generik atas DesignSectionPage
  // (BUKAN ExtraPageDetail langsung), jadi optimistic local-update di sini
  // TIDAK bisa langsung `setPage({...page, ...patch})` di dalam komponen
  // bersama (patch:Partial<DesignSectionPage> tidak dijamin lengkapi semua
  // field ExtraPageDetail secara statis) -- SATU cast di titik jembatan ini
  // aman karena `page` di sisi kanan SELALU objek ExtraPageDetail asli,
  // cuma field yang disebut di `patch` yang berubah.
  function handleDesignLocalChange(patch: DesignSectionPatch) {
    if (!page) return;
    setPage({ ...page, ...patch } as ExtraPageDetail);
  }
  async function handleUploadAvatar(file: File) {
    if (!page) throw new Error("no page");
    return uploadExtraPageAvatar(page.id, file);
  }
  async function handleUploadBackground(file: File) {
    if (!page) return;
    await uploadExtraPageBackground(page.id, file);
  }

  if (loading) return <PageSkeleton />;

  if (!page) {
    return (
      <div className="glass mx-auto max-w-xl rounded-jmd p-8 text-center shadow-card">
        <IconSparkle className="mx-auto h-8 w-8 text-jeon-purple" />
        <h2 className="mt-3 font-display text-lg font-bold text-app-ink">{t("dashboard.components.produkPageEditor.notActive.title")}</h2>
        <p className="mt-2 text-sm text-app-muted">
          {t("dashboard.components.produkPageEditor.notActive.description")}{" "}
          <span className="font-semibold text-app-ink">jeon.id/{username}/{username}</span>.
        </p>
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

  // §13.7 (JEONID-DASHBOARD-REDESIGN-SPEC.md, permintaan langsung
  // pengguna 8 September 2026): "editor template yang sama secara visual
  // dengan Halaman Saya" -- kartu pengaturan atas dibungkus SectionCard
  // (komponen resmi hasil Fase 1 Foundation, dipakai halaman Settings/
  // Editor lain) & tab kategori pakai DesignCategoryTabs (gaya SAMA PERSIS
  // dgn 5 halaman /dashboard/design/* Bio) -- HANYA wrapper visual yang
  // diganti, isi (BlockSection/TemaSection/dst di bawah) TETAP
  // "implementation existing" apa adanya sesuai teks spec, tidak di-reskin.
  // LENGKAP & stabil di production sejak v0.37.0/v0.38.0, flag "sales"
  // dihapus dari file ini 8 September 2026.
  const settingsCardTitle = t("dashboard.components.produkPageEditor.pageTitle");
  const settingsCardAction = (
    <a
      href={`${SITE_URL}/${username}/${page.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs font-semibold text-jeon-purple hover:underline"
    >
      <IconExternal className="h-3.5 w-3.5" />
      jeon.id/{username}/{page.slug}
    </a>
  );
  const settingsCardBody = (
    <>
      <div className="mt-1.5 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${page.is_published ? "bg-jeon-purple" : "bg-muted"}`} />
          <span className={`text-xs font-semibold ${page.is_published ? "text-jeon-purple" : "text-app-muted"}`}>
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
                  ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple"
                  : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.grid")}
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "stacked" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "stacked" ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.stacked")}
            </button>
            <button
              type="button"
              onClick={() => handlePatch({ product_layout: "category" })}
              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold ${
                page.product_layout === "category" ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-app-border text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.components.produkPageEditor.productLayout.category")}
            </button>
          </div>
          {page.product_layout === "category" && (
            <p className="mt-1.5 text-[11px] text-app-muted">{t("dashboard.components.produkPageEditor.productLayout.categoryHint")}</p>
          )}
        </div>
    </>
  );

  const designTabEntries: [DesignSection, string][] = [
    ["blok", t("dashboard.components.produkPageEditor.designTabs.blok")],
    ["tema", t("dashboard.components.produkPageEditor.designTabs.tema")],
    ["header", t("dashboard.components.produkPageEditor.designTabs.header")],
    ["tombol", t("dashboard.components.produkPageEditor.designTabs.tombol")],
    ["font", t("dashboard.components.produkPageEditor.designTabs.font")],
    ["stiker", t("dashboard.components.produkPageEditor.designTabs.stiker")],
  ];

  return (
    <div className="min-w-0">
      <SectionCard title={settingsCardTitle} action={settingsCardAction}>
        {settingsCardBody}
      </SectionCard>

      <div className="mt-4">
        <DesignCategoryTabs
          tabs={designTabEntries.map(([key, label]) => ({ key, label, onClick: () => setSection(key) }))}
          activeKey={section}
        />
      </div>

      <div className="mt-4">
        {section === "blok" && (
          <BlockSection pageId={page.id} links={links} setLinks={setLinks} setError={setError} />
        )}
        {section === "tema" && (
          <TemaSection page={page} isPremium={page.is_premium} onPatch={handlePatch} onError={setError} onUploadBackground={handleUploadBackground} />
        )}
        {section === "header" && (
          <HeaderSection page={page} onLocalChange={handleDesignLocalChange} onPatch={handlePatch} onError={setError} onUploadAvatar={handleUploadAvatar} />
        )}
        {section === "tombol" && <TombolSection page={page} onLocalChange={handleDesignLocalChange} onStyleOverride={handleStyleOverride} />}
        {section === "font" && <FontSection page={page} onLocalChange={handleDesignLocalChange} onStyleOverride={handleStyleOverride} />}
        {section === "stiker" && (
          <section className="glass rounded-jmd p-5 shadow-card">
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
      <section className="glass rounded-jmd p-5 shadow-card">
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-2 text-sm font-bold text-jeon-purple hover:underline">
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
                    blockType === tile.key ? "border-jeon-purple bg-jeon-purple/10 text-jeon-purple" : "border-app-border text-app-muted"
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
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                    className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                  className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none"
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
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                    <FormField label={t("dashboard.components.produkPageEditor.blockForm.faqAnswerLabel")}>
                      <textarea
                        rows={2}
                        value={item.answer}
                        onChange={(e) => setFaqItems((prev) => prev.map((it, i) => (i === idx ? { ...it, answer: e.target.value } : it)))}
                        placeholder={t("dashboard.components.produkPageEditor.blockForm.faqAnswerLabel")}
                        className="w-full rounded-md border border-app-border px-2 py-1.5 text-xs focus:border-jeon-purple focus:outline-none"
                      />
                    </FormField>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setFaqItems((prev) => [...prev, { question: "", answer: "" }])}
                  className="self-start text-xs font-semibold text-jeon-purple hover:underline"
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
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:border-ink/30"
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
            className="flex flex-col gap-2.5 rounded-xl border-2 border-jeon-ink bg-app-surface p-3 shadow-card"
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
              <div className="ml-6 flex flex-col gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
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
                      className={`flex h-16 w-16 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-app-border text-app-muted hover:border-jeon-purple hover:text-jeon-purple ${
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
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.audio_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.audioUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.audioEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
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
              <div className="ml-6 flex items-center gap-2 rounded-lg border border-app-border bg-jeon-purple/5 p-2.5">
                <p className="min-w-0 flex-1 truncate text-[11px] text-app-muted">
                  {(link.block_data?.file_url as string)
                    ? t("dashboard.components.produkPageEditor.blockForm.fileUploaded")
                    : t("dashboard.components.produkPageEditor.blockForm.fileEmpty")}
                </p>
                <label className="flex-shrink-0 cursor-pointer rounded-md border-2 border-jeon-ink bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple">
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
