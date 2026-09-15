"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import {
  ApiError,
  CatalogItem,
  DashboardProduct,
  EmbeddedBuilderBlock,
  EmbeddedCatalogBlock,
  ExtraPageDetail,
  LinkItem,
  MyPage,
  PageStickerData,
  createBlock,
  createExtraPageBlock,
  deleteLink,
  getExtraPage,
  getMyPage,
  listExtraPageLinks,
  listLinks,
  listProducts,
  reorderExtraPageLinks,
  reorderLinks,
  updateExtraPage,
  updateExtraPageStickers,
  updateLink,
  updateMyPage,
  updateMyPageStickers,
  uploadAvatar,
  uploadCustomBackground,
  uploadExtraPageAvatar,
  uploadExtraPageBackground,
} from "@/lib/api-client";
import {
  BuilderColumn,
  BuilderRoot,
  BuilderSeg,
  BuilderSelection,
  buildTree,
  findNodeByPath,
  findSelectionByNodeId,
  getChildrenAt,
  maxBuilderContainerChildren,
  maxBuilderDepth,
  newBuilderBlock,
  setChildrenAt,
  updateAt,
} from "@/lib/builder-blocks";
import { useLocale } from "@/lib/locale-context";
import { useToast } from "@/components/Toast";
import { IconChevronRight, IconPencil } from "@/components/icons";
import BuilderLeftPanel, { type BuilderDesignSection } from "@/components/BuilderLeftPanel";
import BuilderCanvas, { BUILDER_DEVICE_WIDTHS, type BuilderDeviceWidth } from "@/components/BuilderCanvas";
import type { DesignSectionPage, DesignSectionPatch, ProductLayoutValue } from "@/components/dashboard/page/design-sections";

// TYPE_LABEL_KEY -- SATU-SATUNYA pemakaian tersisa di rute ini: label root
// baru begitu ditambahkan lewat "Tambah Komponen" di ROOT (target null),
// APA ADANYA dari versi sebelumnya.
const TYPE_LABEL_KEY: Record<string, string> = {
  text: "typeText",
  button: "typeButton",
  divider: "typeDivider",
  // "link" -- TIDAK PERNAH benar-benar dipakai di sini (handleAdd tidak
  // pernah membuat root tipe ini, cuma bisa MUNCUL dari tautan Mode
  // Simple yang sudah ada) -- entry ini SEKEDAR menutup kerapuhan (gap
  // ditemukan lewat audit, 13 September 2026): tanpa ini, fallback
  // "typeText" akan salah tampil kalau suatu saat kode berubah &
  // TYPE_LABEL_KEY[type] dipanggil dgn "link" di sini juga. Salinan
  // SEBENARNYA yang dipakai (BuilderLeftPanel.tsx) sudah punya ini.
  link: "typeLink",
  column: "typeColumn",
  section: "typeSection",
  video: "typeVideo",
  faq: "typeFaq",
  gallery: "typeImageGrid",
  image: "typeImage",
  video_image: "typeVideoImage",
  embed_link: "typeEmbedLink",
  countdown: "typeCountdown",
  list: "typeList",
  image_slider: "typeImageSlider",
  embed: "typeEmbed",
  maps: "typeMaps",
  produk: "typeProduk",
  heading: "typeHeading",
  contact_form: "typeContactForm",
  accordion: "typeAccordion",
  audio: "typeAudio",
  file: "typeFile",
  project_showcase: "typeProjectShowcase",
  catalog: "typeCatalog",
};

// extractPageDesignPatch -- field yang benar-benar bisa disentuh Tab Design
// panel ini (DesignSectionPage dikurangi avatar_url/name/slug -- avatar
// diunggah lewat endpoint terpisah yang SUDAH langsung ke server, name/slug
// dikelola field rename topbar terpisah, lihat catatan lengkap di
// commitSave). Dipakai HANYA saat Save/Save & Publish ditekan (redesain
// arsitektur draft, lihat catatan lengkap di komponen utama) -- SEBELUMNYA
// tiap field ini langsung PATCH sendiri-sendiri per onBlur/onChange.
function extractPageDesignPatch(p: MyPage): Partial<MyPage> {
  return {
    theme: p.theme,
    display_name: p.display_name,
    bio: p.bio,
    custom_background_type: p.custom_background_type,
    custom_background_value: p.custom_background_value,
    custom_button_color: p.custom_button_color,
    custom_button_style: p.custom_button_style,
    custom_button_rounded: p.custom_button_rounded,
    custom_button_shadow: p.custom_button_shadow,
    custom_font: p.custom_font,
    custom_page_text_color: p.custom_page_text_color,
    custom_title_font: p.custom_title_font,
    custom_title_color: p.custom_title_color,
    custom_style_override: p.custom_style_override,
    layout_variant: p.layout_variant,
    social_instagram: p.social_instagram,
    social_tiktok: p.social_tiktok,
    social_facebook: p.social_facebook,
    social_whatsapp: p.social_whatsapp,
    social_youtube: p.social_youtube,
    social_x: p.social_x,
    social_linkedin: p.social_linkedin,
    social_telegram: p.social_telegram,
    social_email: p.social_email,
    // product_layout -- permintaan langsung pengguna 11 September 2026
    // ("mode simple dan builder untuk produk langsung sediakan pilihan
    // layoutnya"): ikut satu PATCH "Halaman" yang sama dgn tema/header/dst
    // (lihat commitSave langkah 5) -- untuk halaman Bio field ini SELALU
    // undefined (lihat catatan lengkap di MyPage.product_layout, api-client.ts).
    product_layout: p.product_layout,
  };
}

// diffPageDesignPatch -- perbaikan bug ditemukan 11 September 2026 (lewat
// verifikasi live fitur product_layout di atas): commitSave langkah 5
// SEBELUMNYA mengirim SELURUH extractPageDesignPatch(page) begitu SATU
// SAJA field berubah -- termasuk custom_background_type/value APA ADANYA
// walau TIDAK ikut berubah sama sekali. Backend (UpdateMyPage/UpdatePage,
// page.go) menolak SEMUA "Simpan" kreator GRATIS dengan pesan keliru
// "khusus Premium" begitu kedua field itu MUNCUL di request, terlepas
// nilainya berubah atau tidak -- gerbang itu SENGAJA seketat itu (lihat
// TestUpdateMyPage_RejectsCustomBackgroundValueForFreeUser di backend,
// TIDAK diubah) jadi perbaikannya di SINI: kirim HANYA field yang
// NILAINYA benar-benar berbeda dari snapshot server, bukan seluruh objek.
function diffPageDesignPatch(page: MyPage, serverPage: MyPage): Partial<MyPage> {
  const draft = extractPageDesignPatch(page);
  const server = extractPageDesignPatch(serverPage);
  const diff: Partial<MyPage> = {};
  (Object.keys(draft) as (keyof MyPage)[]).forEach((key) => {
    if (draft[key] !== server[key]) {
      (diff as Record<string, unknown>)[key] = draft[key];
    }
  });
  return diff;
}

// makeTempLinkItem -- redesain total (arsitektur draft, 10 September
// 2026): blok ROOT baru ("Tambah Komponen" di target null) SEKARANG dibuat
// LOKAL dulu (id sementara "temp-...", BUKAN dari respons createBlock) --
// baru benar-benar dikirim ke backend (createBlock/createExtraPageBlock,
// mendapat id ASLI) saat Save ditekan, lihat commitSave. Field selain
// id/title/url/block_type/block_data diisi nilai default yang masuk akal
// (SAMA seperti nilai default kolom di backend, links.go) -- tidak pernah
// benar-benar dikirim ke server dalam bentuk ini, cuma dipakai representasi
// draft di memori sebelum create sungguhan.
// cloneBlockDataWithNewIds -- permintaan langsung pengguna, 12 September
// 2026 ("tambahkan titik tiga diujung tiap blok untuk hapus dan clone"):
// menggandakan block_data SATU blok, meregenerasi id SEMUA anak
// bersarang (children[] Section, columns[].children[] Column) secara
// REKURSIF -- WAJIB, bukan sekadar rapi: dnd-kit (useSortable, dipakai
// TIAP baris tree) mendaftarkan id ke SATU registry per <DndContext>
// (bukan per-<SortableContext>), jadi id anak yang IKUT tersalin apa
// adanya dari original akan bentrok begitu blok hasil clone & aslinya
// tampil BERSAMAAN di tree yang sama.
// STORAGE_KEYED_BLOCK_DATA_FIELDS -- field block_data yang key storage-nya
// diturunkan dari id NODE itu sendiri (audio-blocks/<id>.ext,
// file-blocks/<id>.ext, link-media/<linkId>/<nodeId>.webp -- lihat
// UploadAudio/UploadFile/UploadMediaImage/UploadGalleryImage, links.go).
// Clone MEREGENERASI id (di bawah), TAPI nilai STRING URL di field ini
// disalin apa adanya dari original -- jadi clone & original akan
// menunjuk OBJEK STORAGE YANG SAMA PERSIS walau id node-nya sudah beda.
// Bug ditemukan lewat audit (13 September 2026): hapus gambar/audio/file
// di SALAH SATU (clone ATAU original) memanggil endpoint Delete* yang
// menghapus objek FISIK dari storage (bukan cuma lepas referensi) --
// yang SATU LAGI ikut rusak (<img>/<audio> patah, block_data-nya masih
// menyimpan URL mati). Field-field ini DIKOSONGKAN di clone (bukan
// disalin) -- clone mulai dari status "belum ada media", pengguna
// unggah ulang sendiri kalau perlu, sama seperti blok baru yang belum
// pernah diisi.
const STORAGE_KEYED_BLOCK_DATA_FIELDS = ["image_url", "images", "audio_url", "file_url", "file_name", "file_size_bytes"];

// cloneCatalogItems -- bug ditemukan lewat audit ROUND 2 (13 September
// 2026): cloneBlockDataWithNewIds di bawah cuma rekursi ke `children`/
// `columns` (bentuk Section/Column) -- root block_type "catalog" punya
// bentuk BEDA (`block_data.items[]`, lihat CatalogItem, api-client.ts)
// yang TIDAK PERNAH tersentuh, jadi duplikat root Katalog tetap menyalin
// `items[].images` APA ADANYA (persis kelas bug yang sama dgn A2/A3
// putaran 1) -- backend DeleteCatalogItemImage menghapus objek S3
// berdasar URL yang tersimpan itu sendiri, jadi hapus foto di salah satu
// copy Katalog ikut merusak foto di copy lainnya. Item bersarang lewat
// `blocks[]` (EmbeddedCatalogBlock, cuma 5 tipe: text/faq/video/maps/
// catalog) direkursi juga -- HANYA block_type "catalog" di dalamnya yang
// punya `items[]` sendiri yang perlu ikut dibersihkan, 4 tipe lainnya
// tidak menyimpan field berkunci storage apa pun di block_data-nya.
function cloneCatalogItems(items: CatalogItem[] | undefined): CatalogItem[] {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    images: [],
    blocks: Array.isArray(item.blocks)
      ? item.blocks.map((block: EmbeddedCatalogBlock) => ({
          ...block,
          id: crypto.randomUUID(),
          block_data:
            block.block_type === "catalog"
              ? { ...block.block_data, items: cloneCatalogItems((block.block_data as { items?: CatalogItem[] })?.items) }
              : block.block_data,
        }))
      : item.blocks,
  }));
}

function cloneBlockDataWithNewIds(blockData: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!blockData) return {};
  const cloned: Record<string, unknown> = { ...blockData };
  for (const field of STORAGE_KEYED_BLOCK_DATA_FIELDS) {
    delete cloned[field];
  }
  if (Array.isArray(blockData.items)) {
    cloned.items = cloneCatalogItems(blockData.items as CatalogItem[]);
  }
  if (Array.isArray(blockData.children)) {
    cloned.children = (blockData.children as EmbeddedBuilderBlock[]).map((child) => ({
      ...child,
      id: crypto.randomUUID(),
      block_data: cloneBlockDataWithNewIds(child.block_data),
    }));
  }
  if (Array.isArray(blockData.columns)) {
    cloned.columns = (blockData.columns as BuilderColumn[]).map((col) => ({
      ...col,
      children: ((col.children as EmbeddedBuilderBlock[] | undefined) ?? []).map((child) => ({
        ...child,
        id: crypto.randomUUID(),
        block_data: cloneBlockDataWithNewIds(child.block_data),
      })),
    }));
  }
  return cloned;
}

function makeTempLinkItem(type: LinkItem["block_type"], title: string, url: string | undefined, blockData: Record<string, unknown>, position: number): LinkItem {
  return {
    id: `temp-${crypto.randomUUID()}`,
    title,
    url: url ?? "",
    position,
    is_active: true,
    starts_at: null,
    ends_at: null,
    lock_type: "",
    lock_code: "",
    lock_min_age: null,
    block_type: type,
    block_data: blockData,
    click_count: 0,
    custom_icon_url: "",
    icon_key: "",
    icon_color: "",
    is_featured: false,
    thumbnail_url: "",
    description: "",
  };
}

// Canvas Page Builder -- REDESAIN TOTAL (migrasi 000096 asalnya, redesain
// permintaan langsung pengguna 10 September 2026, referensi screenshot
// "LYNK"): rute BARU di app/builder/[pageId] (LUAR app/dashboard/, lihat
// catatan lengkap di app/builder/layout.tsx) MENGGANTIKAN
// app/dashboard/links/builder/[pageId] lama sepenuhnya. pageId "main" =
// halaman utama (bio), selain itu = id halaman tambahan (Toko/Bio
// kedua/Landing) -- konvensi TIDAK BERUBAH dari versi lama.
//
// PERUBAHAN ARSITEKTUR PALING BESAR (dikonfirmasi via AskUserQuestion,
// "Draft sungguhan spt referensi"): SEBELUMNYA setiap perubahan (edit blok,
// tambah/hapus/reorder, ganti tema/warna/font, geser stiker) langsung
// memanggil API satu-satu (autosave onBlur/onChange). SEKARANG semuanya
// murni mutasi LOKAL ke `links`/`page` (draft) -- TIDAK ADA panggilan API
// SAMA SEKALI di handler-handler itu lagi. `serverLinks`/`serverPage`
// menyimpan snapshot TERAKHIR yang BENAR-BENAR tersimpan di backend,
// dipakai (a) menghitung `isDirty` (JSON.stringify -- pola SAMA dipakai
// perbandingan `selection`/path di seluruh builder ini sejak awal) dan
// (b) sumber DIFF saat tombol Save/Save & Publish ditekan (lihat
// commitSave) -- HANYA field yang benar-benar berubah yang memicu
// panggilan API, jadi Save tetap murah walau draft sudah lama dibuka.
//
// Pengecualian yang TETAP langsung ke server terlepas dari status draft
// (disetujui eksplisit di rencana): upload avatar/background/gambar blok/
// stiker gambar -- filenya perlu benar-benar ada di storage supaya bisa
// dipratinjau, TAPI hasilnya (URL) ditambal ke draft & server snapshot
// SEKALIGUS (lihat handleUploadAvatar dst & handleMediaImageChanged) --
// field itu sendiri tidak pernah "belum tersimpan" dari sudut pandang
// pengguna, konsisten dgn pola upload-lalu-assign yang sudah ada di
// seluruh dashboard Jeonme.
export default function BuilderPage() {
  const { t } = useLocale();
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const isMain = pageId === "main";

  const [page, setPage] = useState<MyPage | null>(null);
  const [serverPage, setServerPage] = useState<MyPage | null>(null);
  const [extraPageType, setExtraPageType] = useState<"bio" | "landing" | "produk" | undefined>(undefined);
  const [extraPageSlug, setExtraPageSlug] = useState<string | undefined>(undefined);
  const [extraPageName, setExtraPageName] = useState<string | undefined>(undefined);
  // serverExtraPageName -- snapshot terakhir tersimpan dari `extraPageName`,
  // pola SAMA PERSIS `page`/`serverPage` (bug ditemukan lewat audit ROUND 2,
  // A10): SEBELUMNYA `extraPageName` TIDAK PUNYA snapshot server sama
  // sekali -- rename judul commit LANGSUNG ke API dari saveRenameTitle,
  // bypass total draft/isDirty/tombol Simpan di file ini. Sekarang
  // `extraPageName` murni draft lokal sampai Simpan (lihat isDirty &
  // commitSave langkah 5 di bawah), `serverExtraPageName` menandai nilai
  // yang BENAR-BENAR tersimpan di server.
  const [serverExtraPageName, setServerExtraPageName] = useState<string | undefined>(undefined);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [serverLinks, setServerLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"" | "save" | "publish">("");
  const [device, setDevice] = useState<BuilderDeviceWidth>("desktop");
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [selection, setSelection] = useState<BuilderSelection | null>(null);
  const tree = useMemo(() => buildTree(links), [links]);
  const [designSection, setDesignSection] = useState<BuilderDesignSection>("tema");

  // isDirty -- pola JSON.stringify SAMA PERSIS dipakai perbandingan
  // selection/path di seluruh builder ini sejak Fase 1 (BuilderLeftPanel.tsx),
  // dipilih lagi di sini demi konsistensi -- ukuran draft (blok + field
  // desain per halaman) realistis kecil, biaya JSON.stringify di sini
  // dapat diabaikan dibanding jelasnya kode. `extraPageName` diikutkan
  // (A10, lihat catatan lengkap di deklarasi serverExtraPageName) --
  // rename judul yang belum Disimpan sekarang benar-benar menyalakan
  // tombol Simpan & peringatan "perubahan belum tersimpan" spt field lain.
  const isDirty = useMemo(() => {
    if (!page || !serverPage) return false;
    return (
      JSON.stringify(links) !== JSON.stringify(serverLinks) ||
      JSON.stringify(page) !== JSON.stringify(serverPage) ||
      extraPageName !== serverExtraPageName
    );
  }, [links, serverLinks, page, serverPage, extraPageName, serverExtraPageName]);
  // isDirtyRef -- dibaca dari listener `beforeunload` (lihat efek di bawah)
  // yang HANYA dipasang SEKALI saat mount -- closure listener itu akan
  // menangkap `isDirty` versi PERTAMA (selalu false) kalau tidak lewat ref,
  // pola sama dipakai di tempat lain di dashboard utk masalah closure serupa.
  // Ref di-update lewat efek TERPISAH (BUKAN langsung di badan komponen) --
  // "Cannot access refs during render" (react-hooks/refs, eslint-plugin-
  // react-hooks v7 bundel Next.js 16 proyek ini) melarang mutasi `.current`
  // di luar effect/event handler.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const fetchPageData = useCallback(async () => {
    if (isMain) {
      const [p, l, prod] = await Promise.all([getMyPage(), listLinks(), listProducts()]);
      return { page: p, extraPageType: undefined as "bio" | "landing" | "produk" | undefined, extraPageSlug: undefined as string | undefined, extraPageName: undefined as string | undefined, links: l, products: prod };
    }
    const [detail, l, prod] = await Promise.all([getExtraPage(pageId), listExtraPageLinks(pageId), listProducts()]);
    const shimmed: MyPage = {
      ...(detail as ExtraPageDetail),
      username: "",
      verification: { email_verified: false, profile_complete: false, has_paid_order: false, is_verified: false },
    };
    return {
      page: shimmed,
      extraPageType: detail.page_type,
      extraPageSlug: detail.slug as string | undefined,
      extraPageName: detail.name as string | undefined,
      links: l,
      products: prod,
    };
  }, [isMain, pageId]);

  const applyPageData = useCallback((result: Awaited<ReturnType<typeof fetchPageData>>) => {
    setPage(result.page);
    setServerPage(result.page);
    setExtraPageType(result.extraPageType);
    setExtraPageSlug(result.extraPageSlug);
    setExtraPageName(result.extraPageName);
    setServerExtraPageName(result.extraPageName);
    setLinks(result.links);
    setServerLinks(result.links);
    setProducts(result.products);
  }, []);

  useEffect(() => {
    fetchPageData()
      .then(applyPageData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali per pageId, `t` tidak boleh memicu reload berulang.
  }, [pageId]);

  // Pastikan builder_mode='builder' begitu route ini dibuka -- SATU-
  // SATUNYA panggilan API di luar commitSave (Save/Save & Publish) yang
  // masih tersisa di rute ini: flag TEKNIS internal (bukan konten yang
  // dilihat pengguna), idempoten & soft-fail, sengaja TIDAK ikut model
  // draft supaya halaman publik langsung ikut pindah jalur render begitu
  // builder dibuka, terlepas draft disimpan atau tidak. Ditandai LANGSUNG
  // di `page` MAUPUN `serverPage` sekaligus supaya field teknis ini tidak
  // pernah keliru dianggap "ada perubahan belum disimpan" oleh `isDirty`.
  useEffect(() => {
    if (!page || page.builder_mode === "builder") return;
    const patch = { builder_mode: "builder" as const };
    (isMain ? updateMyPage(patch) : updateExtraPage(pageId, patch))
      .then(() => {
        setPage((prev) => (prev ? { ...prev, builder_mode: "builder" } : prev));
        setServerPage((prev) => (prev ? { ...prev, builder_mode: "builder" } : prev));
      })
      .catch((err) => {
        // Soft-fail -- kanvas tetap bisa dipakai, cuma halaman publik belum
        // ikut pindah render sampai patch ini berhasil (dicoba ulang tiap
        // kali rute ini dibuka lagi). console.error SAJA (bukan toast/error
        // banner -- soft-fail SENGAJA tidak mengganggu alur utama, lihat
        // konvensi CLAUDE.md) -- gap ditemukan lewat audit (13 September
        // 2026): sebelumnya benar-benar TANPA jejak apa pun, kegagalan
        // berulang tidak bisa didiagnosis sama sekali bahkan dari console.
        console.error("gagal menandai builder_mode='builder'", err);
      });
  }, [page, isMain, pageId]);

  function rootToBuilderRoot(root: LinkItem): BuilderRoot {
    return {
      children: root.block_data?.children as EmbeddedBuilderBlock[] | undefined,
      columns: root.block_data?.columns as BuilderColumn[] | undefined,
    };
  }

  // handleAdd/handleDelete/handleReorderRoot/handleReorderChildren/
  // handleUpdateNode -- SEMUA murni `setLinks(...)` sekarang (TIDAK ADA
  // panggilan API), lihat catatan arsitektur draft lengkap di komentar
  // komponen ini. Badan logic path-based (getChildrenAt/setChildrenAt/
  // updateAt) APA ADANYA dari versi lama, cuma dibungkus `setLinks`
  // (functional update) alih-alih await+refresh().
  function handleAdd(target: BuilderSelection | null, type: EmbeddedBuilderBlock["block_type"] | "maps" | "catalog" | "contact_form") {
    setError(null);
    if (!target) {
      const title = t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[type] ?? "typeText"}`);
      // "maps"/"catalog"/"contact_form" -- ketiganya ROOT-ONLY, BUKAN
      // bagian EmbeddedBuilderBlock["block_type"] (lihat catatan lengkap di
      // AddableBlockType, BuilderAddComponentModal.tsx), jadi newBuilderBlock
      // (yang cuma tahu tipe anak tertanam) tidak berlaku -- block_data
      // kosong apa adanya, sama seperti "maps" sebelumnya.
      const blockData =
        type === "maps" || type === "catalog" || type === "contact_form" ? {} : newBuilderBlock(type as EmbeddedBuilderBlock["block_type"]).block_data;
      // url dibiarkan KOSONG di sini (bukan diisi placeholder) -- lihat
      // catatan lengkap di createRootOnServer soal KENAPA & di MANA
      // placeholder itu sekarang disuntikkan (hanya di request ke server,
      // bukan ditampilkan sbg data yang terlihat asli di field editor).
      // Posisi sisip -- bug ditemukan lewat audit ROUND 2 (13 September
      // 2026, A11): SEBELUMNYA blok baru SELALU ditaruh di UJUNG paling
      // bawah daftar root, tidak peduli blok mana yang sedang dipilih --
      // di halaman panjang, "Tambah Komponen" berulang kali berarti
      // scroll jauh ke bawah tiap kali cuma utk menemukan blok yang baru
      // ditambah. Sekarang disisipkan tepat SESUDAH root yang memuat
      // seleksi SAAT INI (`selection.rootId` -- kalau seleksi itu sendiri
      // blok bersarang di dalam Section/Column, tetap dianggap "dekat"
      // root pembungkusnya, BUKAN di akhir array) -- kalau tidak ada
      // seleksi sama sekali, tetap ditaruh di ujung (perilaku lama).
      setLinks((prev) => {
        const newItem = makeTempLinkItem(type as LinkItem["block_type"], title, undefined, blockData, prev.length);
        const insertAfterIndex = selection ? prev.findIndex((l) => l.id === selection.rootId) : -1;
        if (insertAfterIndex === -1) return [...prev, newItem];
        return [...prev.slice(0, insertAfterIndex + 1), newItem, ...prev.slice(insertAfterIndex + 1)];
      });
      return;
    }
    if (type === "maps" || type === "catalog" || type === "contact_form") return; // modal sudah menyaring ini, jaga-jaga saja.
    const root = links.find((l) => l.id === target.rootId);
    if (!root) return;
    const builderRoot = rootToBuilderRoot(root);
    const existing = getChildrenAt(builderRoot, target.path);
    // Tegakkan batas yang SAMA dgn backend (maxBuilderContainerChildren/
    // maxBuilderDepth, lib/builder-blocks.ts) SEBELUM menambah -- bug
    // ditemukan lewat audit (13 September 2026): dua konstanta ini SUDAH
    // ADA & berkomentar "murni utk UI (nonaktifkan tombol lebih awal)"
    // tapi TIDAK ADA satu pun konsumen di frontend -- UI mengizinkan
    // Section 5 tingkat atau kontainer 31 blok, kegagalannya baru
    // muncul saat Simpan ("section maksimal 4 tingkat kedalaman"/
    // "maksimal 30 blok per kontainer", links.go), MEMBATALKAN SELURUH
    // Save (bukan cuma blok yang bermasalah).
    if (existing.length >= maxBuilderContainerChildren) {
      setError(t("dashboard.pages.linksBuilder.errors.containerChildrenLimitReached").replace("{max}", String(maxBuilderContainerChildren)));
      return;
    }
    // target.path.length -- jumlah hop dari root ke KONTAINER ini (root
    // sendiri = depth backend 1) -- kontainer ini sendiri di depth
    // target.path.length+1, ANAK BARU yang ditambahkan (kalau section/
    // column) berada di depth+1 lagi = target.path.length+2.
    if ((type === "section" || type === "column") && target.path.length + 2 > maxBuilderDepth) {
      setError(t("dashboard.pages.linksBuilder.errors.containerDepthLimitReached").replace("{max}", String(maxBuilderDepth)));
      return;
    }
    setLinks((prev) => {
      const freshRoot = prev.find((l) => l.id === target.rootId);
      if (!freshRoot) return prev;
      const freshBuilderRoot = rootToBuilderRoot(freshRoot);
      const freshExisting = getChildrenAt(freshBuilderRoot, target.path);
      // Cek batas ULANG di sini (bukan cuma di atas) -- bug ditemukan lewat
      // audit ROUND 2 (13 September 2026): dua pengecekan di atas membaca
      // `links`/`existing` dari closure render SAAT `handleAdd` dipanggil --
      // kalau `handleAdd` pernah terpanggil 2x dalam tick yang sama (mis.
      // via reuse handler ini tanpa unmount UI pemanggilnya), keduanya lolos
      // cek yang SAMA (closure belum sempat ter-update), keduanya menambah,
      // total anak/depth bisa melewati batas TANPA satu pun pesan error yang
      // benar (Simpan baru gagal belakangan dgn error backend yg generik).
      // Updater `setLinks` SELALU menerima `prev` TERBARU (garansi React) --
      // no-op diam-diam di sini kalau batas SUDAH tercapai di titik mutasi
      // sesungguhnya (TIDAK memanggil setError dari sini -- updater harus
      // murni, lihat pelajaran C8/putaran 1 soal setState di dalam updater).
      if (freshExisting.length >= maxBuilderContainerChildren) return prev;
      if ((type === "section" || type === "column") && target.path.length + 2 > maxBuilderDepth) return prev;
      const updated = setChildrenAt(freshBuilderRoot, target.path, [...freshExisting, newBuilderBlock(type)]);
      return prev.map((l) => (l.id === freshRoot.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    });
  }

  function handleDelete(target: BuilderSelection) {
    setError(null);
    // Bug ditemukan lewat audit (13 September 2026): menu "..." (TreeNodeView,
    // BuilderLeftPanel.tsx) cuma memanggil onDeselect kalau blok yang
    // DIHAPUS itu SENDIRI yang sedang terpilih -- kalau yang terpilih
    // adalah ANAK DI DALAM kontainer (Section/Column) yang dihapus,
    // `selection` tetap menunjuk path yang sudah lenyap sesudahnya, dan
    // panel kiri merender pesan "murni wadah" yang tidak nyambung sampai
    // pengguna mengklik blok lain secara manual. Dibersihkan DI SINI
    // (independen dari pemanggil mana pun) kalau `selection` SAMA DENGAN
    // atau anak dari `target`.
    setSelection((prev) => {
      if (!prev || prev.rootId !== target.rootId) return prev;
      const isSameOrDescendant =
        prev.path.length >= target.path.length && JSON.stringify(prev.path.slice(0, target.path.length)) === JSON.stringify(target.path);
      return isSameOrDescendant ? null : prev;
    });
    if (target.path.length === 0) {
      setLinks((prev) => prev.filter((l) => l.id !== target.rootId));
      return;
    }
    setLinks((prev) => {
      const root = prev.find((l) => l.id === target.rootId);
      if (!root) return prev;
      const builderRoot = rootToBuilderRoot(root);
      const parentPath = target.path.slice(0, -1);
      const lastSeg = target.path[target.path.length - 1];
      if (lastSeg.kind !== "child") return prev; // segmen "column" tidak bisa dihapus langsung -- lihat catatan BuilderLeftPanel.
      const siblings = getChildrenAt(builderRoot, parentPath);
      const updated = setChildrenAt(
        builderRoot,
        parentPath,
        siblings.filter((c) => c.id !== lastSeg.id)
      );
      return prev.map((l) => (l.id === root.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    });
  }

  // handleClone -- permintaan langsung pengguna, 12 September 2026
  // ("tambahkan titik tiga diujung tiap blok untuk hapus dan clone"):
  // salinan ditaruh TEPAT SETELAH blok aslinya (bukan di akhir daftar) --
  // paling wajar untuk "duplikat lalu edit sedikit" (varian A/B konten
  // berdekatan), pola root vs bersarang SAMA PERSIS handleDelete. Root
  // baru pakai id "temp-..." (SAMA seperti blok baru dari "Tambah
  // Komponen", createRootOnServer yang menggantinya dgn id asli saat
  // Save) -- anak bersarang cukup id UUID biasa (bukan baris `links`
  // sendiri, murni JSON di dalam block_data, tidak pernah dikirim
  // terpisah ke server).
  function handleClone(target: BuilderSelection) {
    setError(null);
    if (target.path.length === 0) {
      setLinks((prev) => {
        const index = prev.findIndex((l) => l.id === target.rootId);
        if (index === -1) return prev;
        const original = prev[index];
        // "link" -- tautan klasik lama, BUKAN bisa dikirim ulang lewat
        // createBlock/createExtraPageBlock (createRootOnServer di bawah)
        // -- clone-nya akan mengunci Save selamanya (bug ditemukan lewat
        // audit, 13 September 2026). UI (BuilderLeftPanel.tsx, menu "...")
        // sudah menyembunyikan opsi Duplikat utk tipe ini, guard ini
        // jaga-jaga kalau ada jalur pemanggilan lain di masa depan.
        if (original.block_type === "link") return prev;
        const clone: LinkItem = {
          ...original,
          id: `temp-${crypto.randomUUID()}`,
          block_data: cloneBlockDataWithNewIds(original.block_data),
          // custom_icon_url/thumbnail_url -- field ROOT (LinkItem), BUKAN
          // di dalam block_data, jadi tidak ikut dibersihkan
          // cloneBlockDataWithNewIds -- SAMA PERSIS kasusnya (key storage
          // "link-icons/<id>.webp"/"link-thumbnails/<id>.webp" diturunkan
          // dari id link, disalin verbatim dari original walau id clone
          // sudah baru). Dikosongkan di sini secara eksplisit, is_featured
          // ikut dimatikan krn kartu Featured tanpa thumbnail tidak masuk akal.
          custom_icon_url: "",
          thumbnail_url: "",
          is_featured: false,
        };
        const next = [...prev];
        next.splice(index + 1, 0, clone);
        return next;
      });
      return;
    }
    setLinks((prev) => {
      const root = prev.find((l) => l.id === target.rootId);
      if (!root) return prev;
      const builderRoot = rootToBuilderRoot(root);
      const parentPath = target.path.slice(0, -1);
      const lastSeg = target.path[target.path.length - 1];
      if (lastSeg.kind !== "child") return prev; // column-slot sendiri tidak bisa di-clone.
      const siblings = getChildrenAt(builderRoot, parentPath);
      const originalIndex = siblings.findIndex((c) => c.id === lastSeg.id);
      if (originalIndex === -1) return prev;
      const clonedChild: EmbeddedBuilderBlock = {
        ...siblings[originalIndex],
        id: crypto.randomUUID(),
        block_data: cloneBlockDataWithNewIds(siblings[originalIndex].block_data),
      };
      const nextSiblings = [...siblings];
      nextSiblings.splice(originalIndex + 1, 0, clonedChild);
      const updated = setChildrenAt(builderRoot, parentPath, nextSiblings);
      return prev.map((l) => (l.id === root.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    });
  }

  function handleReorderRoot(orderedIds: string[]) {
    setLinks((prev) => {
      const byId = new Map(prev.map((l) => [l.id, l] as const));
      return orderedIds.map((id) => byId.get(id)).filter((l): l is LinkItem => !!l);
    });
  }

  function handleReorderChildren(rootId: string, containerPath: BuilderSeg[], orderedIds: string[]) {
    setError(null);
    setLinks((prev) => {
      const root = prev.find((l) => l.id === rootId);
      if (!root) return prev;
      const builderRoot = rootToBuilderRoot(root);
      const existing = getChildrenAt(builderRoot, containerPath);
      const byId = new Map(existing.map((c) => [c.id, c] as const));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((c): c is EmbeddedBuilderBlock => !!c);
      const updated = setChildrenAt(builderRoot, containerPath, reordered);
      return prev.map((l) => (l.id === root.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    });
  }

  function handleUpdateNode(target: BuilderSelection, patch: { title?: string; url?: string; description?: string; blockData?: Record<string, unknown> }) {
    setError(null);
    setLinks((prev) => {
      if (target.path.length === 0) {
        return prev.map((l) =>
          l.id === target.rootId
            ? {
                ...l,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.url !== undefined ? { url: patch.url } : {}),
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                ...(patch.blockData !== undefined ? { block_data: { ...l.block_data, ...patch.blockData } } : {}),
              }
            : l
        );
      }
      const root = prev.find((l) => l.id === target.rootId);
      if (!root) return prev;
      const builderRoot = rootToBuilderRoot(root);
      const updated = updateAt(builderRoot, target.path, (node) => {
        if (!("block_type" in node)) return node; // BuilderColumn tidak punya title/url/block_data sendiri.
        return {
          ...node,
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.blockData !== undefined ? { block_data: { ...node.block_data, ...patch.blockData } } : {}),
        };
      });
      return prev.map((l) => (l.id === root.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    });
  }

  // createRootOnServer -- badan create SATU root ROOT (dipakai commitSave
  // langkah 2 MAUPUN ensureRootPersisted di bawah, diekstrak supaya cast
  // block_type & pemilihan createBlock/createExtraPageBlock TIDAK
  // terduplikasi di dua tempat).
  async function createRootOnServer(root: LinkItem): Promise<LinkItem> {
    // Cast block_type -- root "temp-..." SELALU dibuat lewat makeTempLinkItem
    // dgn `type` dari handleAdd (EmbeddedBuilderBlock["block_type"] | "maps",
    // TIDAK PERNAH "link"), tapi begitu masuk state `links: LinkItem[]`
    // tipenya melebar lagi ke union PENUH LinkItem.block_type (termasuk
    // "link", yang TIDAK diterima createBlock/createExtraPageBlock) --
    // cast ini aman krn dijamin oleh cara root ini dibuat.
    const blockType = root.block_type as Exclude<LinkItem["block_type"], "link">;
    // url fallback -- backend MEWAJIBKAN url non-kosong utk root
    // "button"/"maps"/"project_showcase" (links.go). Bug ditemukan lewat
    // audit (13 September 2026): SEBELUMNYA "https://example.com" ini
    // disuntikkan lewat handleAdd LANGSUNG ke field `url` yang terlihat di
    // editor -- kalau blok itu di-Simpan&Terbitkan tanpa pernah disentuh,
    // halaman publik berakhir dengan tombol/CTA sungguhan menuju
    // example.com, terlihat seperti data asli yang lupa diisi, bukan
    // placeholder. Fallback ini SEKARANG cuma dipakai di REQUEST ke server
    // (kalau field-nya MASIH kosong di titik ini), field yang TERLIHAT di
    // editor tetap kosong apa adanya sampai kreator benar-benar mengisinya.
    const needsUrlFallback = (blockType === "button" || blockType === "maps" || blockType === "project_showcase") && !root.url;
    const url = needsUrlFallback ? "https://example.com" : root.url || undefined;
    return isMain
      ? createBlock({ block_type: blockType, title: root.title, url, block_data: root.block_data, description: root.description || undefined })
      : createExtraPageBlock(pageId, { block_type: blockType, title: root.title, url, block_data: root.block_data, description: root.description || undefined });
  }

  // ensureRootPersisted -- upload gambar blok (image/gallery/video_image/
  // embed_link) TETAP langsung ke server terlepas status draft (lihat
  // catatan lengkap di handleMediaImageChanged/handleGalleryImagesChanged
  // di bawah), TAPI endpoint upload itu (uploadBuilderMediaImage/
  // uploadGalleryImage) BUTUH id ROOT ASLI dari backend -- kalau blok/
  // kontainernya baru ditambah & BELUM PERNAH disimpan (id masih
  // "temp-...", murni lokal), upload akan gagal karena baris itu belum
  // ada di database sama sekali. Ditemukan lewat tinjauan kode sendiri
  // (bukan cuma dari referensi/plan) -- skenario "tambah blok Foto baru,
  // langsung unggah foto sebelum pernah klik Simpan" itu wajar & umum,
  // BUKAN edge case langka. Dipanggil BuilderLeftPanel.tsx (MediaImageEditor/
  // GalleryGridEditor) SEBELUM upload/hapus -- kalau id target masih
  // sementara, root itu di-create dulu ke server (silent, transparan bagi
  // pengguna), lalu id sementara ditambal jadi id asli di `links`/
  // `serverLinks`/`selection` SEKALIGUS (pola sama seperti remap selection
  // per-iterasi di commitSave) sebelum id asli itu dikembalikan ke pemanggil.
  // pendingRootPersistRef -- bug ditemukan lewat audit ROUND 2 (13
  // September 2026): ensureRootPersistedImpl di bawah TIDAK PUNYA lock
  // apa pun -- dua blok anak dalam SATU root yang sama-sama masih
  // "temp-..." (mis. Kolom baru diisi 2 foto sekaligus SEBELUM pernah
  // Simpan) memicu 2 panggilan hampir bersamaan dengan rootId yang SAMA,
  // masing-masing lolos cek `rootId.startsWith("temp-")` dan memanggil
  // createRootOnServer SENDIRI-SENDIRI -- dua baris server terpisah utk
  // satu root yang sama, `setServerLinks` menambahkan KEDUANYA tanpa
  // guard (`links`/draft cuma menyimpan hasil yang resolve TERAKHIR,
  // yang lain jadi baris yatim di server). Kalau reload/buka ulang
  // terjadi SEBELUM Simpan berikutnya (yang biasanya membersihkan baris
  // yatim ini lewat langkah 1 commitSave), duplikat itu permanen ikut
  // termuat. Di-cache di sini per rootId supaya panggilan KEDUA (dst)
  // menunggu promise panggilan PERTAMA selesai, bukan create baru.
  const pendingRootPersistRef = useRef<Map<string, Promise<string>>>(new Map());
  async function ensureRootPersisted(rootId: string): Promise<string> {
    const pending = pendingRootPersistRef.current.get(rootId);
    if (pending) return pending;
    const promise = ensureRootPersistedImpl(rootId).finally(() => {
      pendingRootPersistRef.current.delete(rootId);
    });
    pendingRootPersistRef.current.set(rootId, promise);
    return promise;
  }
  async function ensureRootPersistedImpl(rootId: string): Promise<string> {
    if (rootId.startsWith("temp-")) {
      const root = links.find((l) => l.id === rootId);
      if (!root) return rootId;
      const created = await createRootOnServer(root);
      setLinks((prev) => prev.map((l) => (l.id === rootId ? created : l)));
      setServerLinks((prev) => [...prev, created]);
      setSelection((prev) => (prev && prev.rootId === rootId ? { ...prev, rootId: created.id } : prev));
      return created.id;
    }
    // Root sudah pernah dipersist SEBELUMNYA (bukan lagi "temp-..."), TAPI
    // salinan server-nya bisa saja sudah basi -- BUG ditemukan lewat audit
    // (13 September 2026): kalau anak BARU ditambah ke root ini SETELAH
    // upload sebelumnya (yang mempersist root ini apa adanya saat itu,
    // lihat cabang di atas) tanpa Simpan di antaranya, salinan server tetap
    // tidak punya anak baru itu -- upload/hapus ke anak baru itu 404
    // "blok tidak ditemukan pada path yang diminta" karena resolveBuilderBlockData
    // (backend) jalan di atas block_data basi. Sinkronkan draft SAAT INI ke
    // server dulu (SEBELUM upload/hapus jalan) kalau memang berbeda dari
    // snapshot server -- generalisasi, bukan cuma menutup satu skenario:
    // menutupi SEMUA kasus draft root ini berubah sejak terakhir disimpan
    // (anak baru, urutan berubah, dst), bukan hanya "anak baru ditambah".
    const root = links.find((l) => l.id === rootId);
    const serverRoot = serverLinks.find((l) => l.id === rootId);
    if (root && serverRoot && JSON.stringify(root.block_data) !== JSON.stringify(serverRoot.block_data)) {
      await updateLink(rootId, { block_data: root.block_data });
      setServerLinks((prev) => prev.map((l) => (l.id === rootId ? { ...l, block_data: root.block_data } : l)));
    }
    return rootId;
  }

  // handleMediaImageChanged/handleGalleryImagesChanged -- lihat catatan
  // lengkap di BuilderLeftPanel.tsx (MediaImageEditor/GalleryGridEditor):
  // upload/hapus gambar blok TETAP langsung ke server (pengecualian
  // disetujui di rencana), tapi hasilnya ditambal ke SATU path spesifik ini
  // di `links` (draft) MAUPUN `serverLinks` (snapshot) SEKALIGUS -- field
  // ini sendiri sudah "resmi tersimpan" begitu upload sukses, jadi tidak
  // boleh ikut dianggap draft belum disimpan (isDirty) ATAUPUN tertimpa
  // balik draft field lain kalau Save ditekan belakangan. `rootId` di sini
  // SELALU id ASLI (dikembalikan ensureRootPersisted ke MediaImageEditor/
  // GalleryGridEditor SEBELUM upload, lihat catatan lengkap di atas), bukan
  // `node.rootId` mentah yang bisa saja masih "temp-..." kalau dibaca dari
  // closure basi.
  function applyFieldToPath(rootId: string, path: BuilderSeg[], patchBlockData: (blockData: Record<string, unknown>) => Record<string, unknown>) {
    const apply = (list: LinkItem[]): LinkItem[] => {
      const root = list.find((l) => l.id === rootId);
      if (!root) return list;
      if (path.length === 0) {
        return list.map((l) => (l.id === rootId ? { ...l, block_data: patchBlockData(l.block_data) } : l));
      }
      const builderRoot = rootToBuilderRoot(root);
      const updated = updateAt(builderRoot, path, (node) => {
        if (!("block_type" in node)) return node;
        return { ...node, block_data: patchBlockData(node.block_data) };
      });
      return list.map((l) => (l.id === root.id ? { ...l, block_data: { ...l.block_data, ...updated } } : l));
    };
    setLinks(apply);
    setServerLinks(apply);
  }
  function handleMediaImageChanged(rootId: string, path: BuilderSeg[], imageUrl: string) {
    applyFieldToPath(rootId, path, (bd) => ({ ...bd, image_url: imageUrl }));
  }
  function handleGalleryImagesChanged(rootId: string, path: BuilderSeg[], images: string[]) {
    applyFieldToPath(rootId, path, (bd) => ({ ...bd, images }));
  }
  // handleAudioChanged/handleFileChanged -- Fase 4 (13 September 2026, blok
  // "audio"/"file" ditanam di Section/Column): pola SAMA PERSIS
  // handleMediaImageChanged/handleGalleryImagesChanged di atas via
  // applyFieldToPath yang sama, cuma menerima objek patch (bukan satu
  // string) karena lebih dari satu field block_data berubah sekaligus.
  // Audio JUGA menimpa `title` blok -- TAPI HANYA kalau backend
  // mengembalikannya (root/path kosong, lihat catatan lengkap di
  // UploadAudio, links.go) -- title BUKAN bagian block_data, jadi ditambal
  // terpisah ke `links`/`serverLinks` (bukan lewat applyFieldToPath).
  function handleAudioChanged(rootId: string, path: BuilderSeg[], patch: { audio_url: string; title?: string }) {
    applyFieldToPath(rootId, path, (bd) => ({ ...bd, audio_url: patch.audio_url }));
    if (patch.title !== undefined) {
      setLinks((prev) => prev.map((l) => (l.id === rootId ? { ...l, title: patch.title! } : l)));
      setServerLinks((prev) => prev.map((l) => (l.id === rootId ? { ...l, title: patch.title! } : l)));
    }
  }
  function handleFileChanged(rootId: string, path: BuilderSeg[], patch: { file_url: string; file_name?: string; file_size_bytes?: number }) {
    applyFieldToPath(rootId, path, (bd) => ({ ...bd, file_url: patch.file_url, file_name: patch.file_name, file_size_bytes: patch.file_size_bytes }));
  }

  // handlePatch/handleStyleOverride/handleDesignLocalChange -- redesain
  // arsitektur draft: SEKARANG murni `setPage` (draft lokal), TIDAK ADA
  // panggilan API lagi (dulu handlePatch langsung PATCH ke backend dengan
  // optimistic+rollback -- rollback tidak relevan lagi karena tidak ada
  // panggilan yang bisa gagal). Prop yang diterima BuilderLeftPanel.tsx
  // (onPatch/onLocalChange/onStyleOverride) TIDAK BERUBAH SAMA SEKALI --
  // komponen itu sendiri tidak tahu ataupun peduli draft vs autosave.
  function handlePatch(patch: DesignSectionPatch) {
    setPage((prev) => (prev ? ({ ...prev, ...patch } as MyPage) : prev));
  }
  function handleStyleOverride(patch: Omit<DesignSectionPatch, "theme" | "custom_style_override">) {
    handlePatch({ ...patch, custom_style_override: true });
  }
  function handleDesignLocalChange(patch: DesignSectionPatch) {
    setPage((prev) => (prev ? ({ ...prev, ...patch } as MyPage) : prev));
  }
  // handleUploadAvatar/handleUploadBackground -- TETAP langsung ke server
  // (pengecualian disetujui di rencana, lihat catatan lengkap di komentar
  // komponen ini) -- URL hasilnya diterapkan pemanggil (design-sections.tsx)
  // lewat onLocalChange (draft lokal, SAMA seperti sebelumnya), BUKAN
  // ditambal ke serverPage juga seperti handleMediaImageChanged (avatar_url
  // BUKAN bagian dari extractPageDesignPatch/updateMyPage sama sekali --
  // backend sudah menyimpannya sendiri saat upload, field ini tidak pernah
  // dikirim ulang lewat commitSave, jadi tidak perlu disinkronkan ke
  // serverPage utk akurasi isDirty).
  async function handleUploadAvatar(file: File) {
    return isMain ? uploadAvatar(file) : uploadExtraPageAvatar(pageId, file);
  }
  async function handleUploadBackground(file: File) {
    const { custom_background_value } = isMain ? await uploadCustomBackground(file) : await uploadExtraPageBackground(pageId, file);
    // Sinkronkan field ini ke snapshot server JUGA -- pola sama seperti
    // handleMediaImageChanged/handleGalleryImagesChanged (field ini sendiri
    // sudah "resmi tersimpan" begitu upload sukses, TIDAK BOLEH ikut
    // dianggap draft belum disimpan/isDirty). TemaSection (design-sections.tsx)
    // masih memanggil onPatch({...}) sesudah ini utk update draft `page`
    // yang terlihat di UI -- baris ini KHUSUS melengkapi sisi `serverPage`
    // yang tidak terjangkau onPatch generik itu.
    setServerPage((prev) => (prev ? { ...prev, custom_background_type: "image", custom_background_value } : prev));
    return custom_background_value;
  }
  function handleStickersChange(stickers: PageStickerData[]) {
    setPage((prev) => (prev ? { ...prev, stickers } : prev));
  }
  // handleProductLayoutChange -- permintaan langsung pengguna 11 September
  // 2026 ("mode simple dan builder untuk produk langsung sediakan pilihan
  // layoutnya"): draft-only sama seperti handlePatch di atas, TERPISAH
  // darinya (bukan DesignSectionPatch) karena `product_layout` SENGAJA
  // bukan bagian DesignSectionPage (field ini cuma relevan utk halaman
  // Toko, lihat catatan lengkap di ProductLayoutSection, design-sections.tsx)
  // -- disertakan ke server lewat extractPageDesignPatch di commitSave.
  function handleProductLayoutChange(value: ProductLayoutValue) {
    setPage((prev) => (prev ? { ...prev, product_layout: value } : prev));
  }

  const selectedNodeId = useMemo(() => {
    if (!selection || selection.kind !== "block") return undefined;
    if (selection.path.length === 0) return selection.rootId;
    return findNodeByPath(tree, selection.rootId, selection.path)?.id;
  }, [selection, tree]);

  function handleSelectNode(nodeId: string | null) {
    setSelection(nodeId ? findSelectionByNodeId(tree, nodeId) : null);
  }

  // commitSave -- SATU-SATUNYA tempat rute ini benar-benar memanggil API
  // penulisan blok/desain (selain builder_mode & upload gambar, lihat
  // catatan masing-masing di atas). Diff terhadap `serverLinks`/`serverPage`
  // (snapshot terakhir yang BENAR-BENAR tersimpan) -- urutan: hapus root
  // yang hilang dari draft, buat root baru (id "temp-..."), PATCH root yang
  // isinya berubah, reorder (selalu, murah & idempoten), lalu PATCH
  // halaman + stiker kalau berubah, terakhir publish kalau diminta.
  // `serverLinks`/`serverPage` di-update SEGERA setelah TIAP langkah
  // berhasil (bukan cuma di akhir) -- kalau satu langkah gagal di tengah,
  // langkah-langkah SEBELUMNYA yang sudah sukses tidak diulang percuma
  // saat pengguna menekan Save lagi (retry aman, bukan duplikat).
  async function commitSave(publish: boolean) {
    if (!page || !serverPage) return;
    setSaving(publish ? "publish" : "save");
    setError(null);
    try {
      let nextServerLinks = serverLinks;

      // 1) Hapus root yang sudah tidak ada di draft.
      const draftIds = new Set(links.map((l) => l.id));
      for (const root of serverLinks) {
        if (draftIds.has(root.id)) continue;
        await deleteLink(root.id);
        nextServerLinks = nextServerLinks.filter((l) => l.id !== root.id);
        setServerLinks(nextServerLinks);
      }

      // 2) Buat root baru (id sementara "temp-...") -- urutan draft dijaga,
      // id sementara diganti id asli hasil createBlock/createExtraPageBlock.
      // Remap `selection` ke id asli JUGA per-iterasi (bukan sekali di luar
      // loop, bug ROUND 2 -- lihat catatan setLinks per-iterasi di bawah utk
      // alasan yang SAMA PERSIS): kalau root ke-3 dari 5 gagal dibuat, root
      // 1 & 2 sudah sukses & `links`/`serverLinks` sudah ditambal betul,
      // TAPI remap `selection` yang dulu ditaruh SETELAH loop tidak pernah
      // tercapai -- kalau salah satu dari root 1/2 itu sedang terpilih,
      // `selection.rootId` tetap mengacu id sementara yang sudah lenyap dari
      // `links`, panel kiri deselect sendiri padahal bloknya SUDAH tersimpan.
      let nextDraftLinks: LinkItem[] = [];
      for (const root of links) {
        if (!root.id.startsWith("temp-")) {
          nextDraftLinks = [...nextDraftLinks, root];
          continue;
        }
        const created = await createRootOnServer(root);
        setSelection((prev) => (prev && prev.rootId === root.id ? { ...prev, rootId: created.id } : prev));
        // setLinks per-iterasi (BUKAN sekali di luar loop) -- bug ditemukan
        // lewat audit (13 September 2026): SEBELUMNYA hanya `serverLinks`
        // yang ditambal per-iterasi, `links` (draft) ditambal SEKALI di
        // akhir loop -- kalau root ke-3 dari 5 gagal dibuat, root 1 &amp; 2
        // SUDAH ada di `serverLinks` tapi `links` masih memegang id
        // "temp-..." lama utk keduanya. Retry Save berikutnya melihat id
        // server 1 &amp; 2 tidak ada di draftIds (masih temp-) -> langkah 1
        // MENGHAPUS keduanya -> langkah 2 MEMBUATNYA ULANG dgn id baru --
        // bukan duplikat (self-healing), TAPI churn hapus-buat-ulang yang
        // seharusnya tidak perlu, bertentangan dgn klaim "langkah yang
        // sudah sukses tidak diulang" di komentar atas. Update SEKARANG
        // (array baru tiap iterasi, bukan mutasi in-place) supaya `links`
        // SELALU selaras dgn `serverLinks` di titik kegagalan mana pun.
        nextDraftLinks = [...nextDraftLinks, created];
        setLinks(nextDraftLinks);
        nextServerLinks = [...nextServerLinks, created];
        setServerLinks(nextServerLinks);
      }

      // 3) PATCH root yang sudah ada SEBELUM Save ini (bukan baru dibuat di
      // langkah 2) tapi isinya berubah dari snapshot server terakhir.
      const originalById = new Map(serverLinks.map((l) => [l.id, l] as const));
      for (const root of nextDraftLinks) {
        const before = originalById.get(root.id);
        if (!before) continue; // baru dibuat di langkah 2, sudah pasti sinkron dgn server.
        const changed =
          before.title !== root.title ||
          before.url !== root.url ||
          before.description !== root.description ||
          JSON.stringify(before.block_data) !== JSON.stringify(root.block_data);
        if (!changed) continue;
        // url: root.url || undefined -- BUKAN root.url mentah (bug ditemukan
        // lewat verifikasi e2e live, 10 September 2026): blok kontainer
        // (section/column/divider/dst) TIDAK PERNAH punya URL sungguhan
        // (selalu string kosong sejak dibuat, lihat makeTempLinkItem) --
        // mengirim `url: ""` di payload PATCH ditolak validasi backend
        // ("URL harus berupa URL http/https yang valid", UpdateLink
        // links.go tidak merelaksasi field ini seperti CreateBlock).
        // createRootOnServer (langkah 2 di atas) sudah benar sejak awal,
        // cabang UPDATE ini yang sebelumnya lupa filter yang sama.
        await updateLink(root.id, { title: root.title, url: root.url || undefined, description: root.description, block_data: root.block_data });
        nextServerLinks = nextServerLinks.map((l) => (l.id === root.id ? root : l));
        setServerLinks(nextServerLinks);
      }

      // 4) Reorder -- selalu dipanggil kalau ada root sama sekali (idempoten
      // & murah kalau urutan kebetulan sudah sama, lebih sederhana
      // daripada diff urutan manual).
      if (nextDraftLinks.length > 0) {
        const items = nextDraftLinks.map((l, i) => ({ id: l.id, position: i }));
        await (isMain ? reorderLinks(items) : reorderExtraPageLinks(pageId, items));
      }

      // 5) Halaman (tema/header/tombol/font/publish) -- satu PATCH, HANYA
      // field yang benar-benar berubah (lihat catatan lengkap di
      // diffPageDesignPatch -- backend menolak keras field custom_background_*
      // begitu MUNCUL di request sama sekali, jadi mengirim seluruh objek
      // padahal cuma satu field lain yang berubah akan salah ditolak
      // "khusus Premium"). Judul halaman tambahan (`extraPageName`) IKUT
      // di sini sekarang (bug ditemukan lewat audit ROUND 2, A10) --
      // SEBELUMNYA rename judul PATCH langsung ke server dari saveRenameTitle
      // sendiri (bypass total arsitektur draft/isDirty/Simpan di file ini) --
      // sekarang `extraPageName` cuma draft lokal (lihat startRenameTitle/
      // saveRenameTitle) sampai Simpan ditekan, konsisten dgn field halaman
      // lain. `name` BUKAN bagian `Partial<MyPage>` (halaman utama tidak
      // punya nama), jadi ditambahkan terpisah HANYA di cabang non-isMain.
      const patch: Partial<MyPage> = diffPageDesignPatch(page, serverPage);
      if (publish) patch.is_published = true;
      const nameChanged = !isMain && extraPageName !== serverExtraPageName;
      if (Object.keys(patch).length > 0 || nameChanged) {
        if (isMain) {
          await updateMyPage(patch);
        } else {
          await updateExtraPage(pageId, nameChanged ? { ...patch, name: extraPageName } : patch);
        }
      }
      if (nameChanged) setServerExtraPageName(extraPageName);

      // 6) Stiker -- endpoint terpisah (ganti array utuh, bukan PATCH per field).
      if (JSON.stringify(page.stickers) !== JSON.stringify(serverPage.stickers)) {
        await (isMain ? updateMyPageStickers(page.stickers) : updateExtraPageStickers(pageId, page.stickers));
      }

      const finalPage: MyPage = publish ? { ...page, is_published: true } : page;
      setPage(finalPage);
      setServerPage(finalPage);
      showToast(publish ? t("dashboard.pages.linksBuilder.publishSuccess") : t("dashboard.pages.linksBuilder.saveSuccess"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
    } finally {
      setSaving("");
    }
  }

  function handleBack() {
    if (isDirty && !window.confirm(t("dashboard.pages.linksBuilder.unsavedChangesWarning"))) return;
    router.push(extraPageType === "produk" ? "/dashboard/products" : "/dashboard/links");
  }

  function startRenameTitle() {
    if (isMain || !extraPageName) return;
    setTitleDraft(extraPageName);
    setRenamingTitle(true);
  }
  // cancelRenameTitle -- Escape membatalkan tanpa menyimpan (gap ditemukan
  // lewat audit, 13 September 2026: SEBELUMNYA hanya Enter/blur yang
  // commit, TIDAK ADA cara membatalkan sekali sudah mengetik selain
  // mengetik ulang nama lama secara manual). SEKARANG JUGA dipakai sbg
  // `onBlur` input (lihat catatan lengkap di situ, bug ROUND 2) --
  // fungsi yang SAMA, satu tempat.
  function cancelRenameTitle() {
    setRenamingTitle(false);
    setTitleDraft(extraPageName ?? "");
  }
  // saveRenameTitle -- hanya dipicu Enter (bukan lagi onBlur juga, lihat
  // catatan lengkap di JSX input-nya, bug ROUND 2/C8). SEKARANG cuma
  // menulis DRAFT lokal (`extraPageName`), TIDAK ADA panggilan API sama
  // sekali di sini -- bug ditemukan lewat audit ROUND 2 (13 September
  // 2026, A10): SEBELUMNYA fungsi ini PATCH langsung ke server, bypass
  // total arsitektur draft/isDirty/tombol Simpan file ini (satu-satunya
  // field di seluruh Builder yang begitu) -- rename sekarang menyalakan
  // `isDirty` spt field lain (lihat deklarasinya) & baru benar-benar
  // terkirim ke server lewat commitSave langkah 5, PERSIS field halaman
  // lainnya (tema/header/dst). Escape/klik-keluar TETAP membatalkan tanpa
  // menyimpan draft (cancelRenameTitle) -- cuma Enter yang commit ke
  // draft (BUKAN ke server, itu tugas Simpan).
  function saveRenameTitle() {
    setRenamingTitle(false);
    const name = titleDraft.trim();
    if (!name || name === extraPageName) return;
    setExtraPageName(name);
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-app-muted">{t("dashboard.pages.linksBuilder.loading")}</div>;
  }

  if (!page) {
    return <div className="flex h-screen items-center justify-center text-sm text-app-muted">{t("dashboard.pages.linksBuilder.errors.loadFailed")}</div>;
  }

  // designPage -- DesignSectionPage butuh `slug` opsional (dipakai HANYA
  // sbg inisial avatar kosong, lihat design-sections.tsx) -- `page: MyPage`
  // tidak punya field itu sama sekali, jadi diisi di sini dari sumber yang
  // paling masuk akal utk tiap kasus (bukan dari `page` itu sendiri, biar
  // tidak perlu mengubah bentuk state `page`).
  const designPage: DesignSectionPage = { ...page, slug: isMain ? page.username : extraPageSlug };
  const title = isMain ? t("dashboard.pages.linksBuilder.title") : extraPageName || t("dashboard.pages.linksBuilder.title");

  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-4 py-2.5">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1 text-xs font-bold text-app-muted hover:text-app-ink"
        >
          <IconChevronRight className="h-4 w-4 rotate-180" />
          {t("dashboard.pages.linksBuilder.back")}
        </button>
        {/* next/image 128x48 (audit performa 15 September 2026) -- rasio
            intrinsik 8:3 file aslinya (2048x768), tinggi tampil tetap diatur
            CSS `h-5 w-auto`. Lihat catatan lengkap di components/landing/Logo.tsx. */}
        <Image src="/jeon-logo-new.png" alt="jeon.id" width={128} height={48} className="brand-logo-light h-5 w-auto" />
        <Image src="/jeon-logo-new-dark.png" alt="jeon.id" width={128} height={48} className="brand-logo-dark h-5 w-auto" />

        <div className="flex min-w-0 flex-1 items-center justify-center">
          {renamingTitle ? (
            <input
              type="text"
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              // onBlur=cancelRenameTitle (BUKAN saveRenameTitle) -- bug
              // ditemukan lewat audit ROUND 2 (13 September 2026, verifikasi
              // Playwright LANGSUNG, bukan cuma tinjauan kode): blur-flush
              // tombol Simpan (onMouseDown di wrapper tombol Simpan/Terbitkan
              // di bawah) meng-blur field APA PUN yang sedang fokus SEBELUM
              // `click` didispatch -- percobaan awal mengecualikan input ini
              // dari blur-flush TERNYATA TIDAK CUKUP: `e.preventDefault()`
              // pada mousedown cuma mencegah FOKUS BARU pindah ke tombol,
              // TIDAK mencegah BLUR elemen lama itu sendiri (dikonfirmasi
              // lewat page.evaluate() di test, document.activeElement jatuh
              // ke <body> tepat sesudah mousedown, MESKI preventDefault
              // sudah dipanggil) -- browser lebih dulu blur elemen lama,
              // BARU cek apakah boleh fokus ke target baru, dua langkah
              // terpisah yang tidak sama-sama dibatalkan oleh satu
              // preventDefault. Karena blur TIDAK BISA dicegah dari sisi
              // JS secara andal, field ini diubah supaya blur (apa pun
              // penyebabnya -- klik Simpan, klik area lain, dst) SAMA
              // PERSIS dengan Escape: batalkan tanpa menyimpan draft.
              // Enter commit ke DRAFT (`extraPageName`, bukan langsung ke
              // server -- gap A10 SUDAH diperbaiki, lihat catatan lengkap
              // di saveRenameTitle & isDirty), baru benar-benar terkirim
              // ke server saat tombol Simpan ditekan spt field lain, jadi
              // tidak perlu lagi `disabled`/loading state di sini.
              onBlur={cancelRenameTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveRenameTitle();
                else if (e.key === "Escape") cancelRenameTitle();
              }}
              placeholder={t("dashboard.pages.linksBuilder.renameTitlePlaceholder")}
              className="w-full max-w-xs rounded-md border border-jeon-purple px-2 py-1 text-center text-sm font-bold text-app-ink outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={startRenameTitle}
              disabled={isMain}
              className={`flex max-w-xs items-center gap-1.5 truncate text-sm font-bold text-app-ink ${!isMain ? "hover:text-jeon-purple" : ""}`}
            >
              <span className="truncate">{title}</span>
              {!isMain && <IconPencil className="h-3 w-3 flex-shrink-0 text-app-muted" />}
            </button>
          )}
        </div>

        <div className="hidden items-center gap-1.5 rounded-full bg-app-surface-2 p-1 sm:flex">
          {(Object.keys(BUILDER_DEVICE_WIDTHS) as BuilderDeviceWidth[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                device === key ? "bg-jeon-sidebar text-white" : "text-app-muted hover:text-app-ink"
              }`}
            >
              {t(`dashboard.pages.linksBuilder.device.${key}`)}
            </button>
          ))}
        </div>

        {/* onMouseDown -- bug ditemukan lewat audit (13 September 2026):
            hampir semua field di panel kiri pakai defaultValue+onBlur
            (BUKAN onChange terkontrol) -- mengetik lalu LANGSUNG klik
            Simpan tanpa klik di tempat lain dulu berarti onBlur field itu
            belum sempat jalan saat tombol Simpan dievaluasi, `isDirty`
            masih false, tombol disabled, klik TIDAK BERPENGARUH sama
            sekali (tombol native disabled tidak menerima event apa pun).
            Blur paksa di SINI (div pembungkus, BUKAN tombolnya sendiri --
            div tidak pernah "disabled" jadi selalu menerima mousedown)
            terjadi SEBELUM `click` didispatch ke tombol, memberi React
            waktu me-render ulang `disabled` dengan `isDirty` yang sudah
            benar sebelum browser mengevaluasi apakah tombol boleh
            menerima klik itu. */}
        <div
          className="flex flex-shrink-0 items-center gap-2"
          onMouseDown={() => {
            if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
              document.activeElement.blur();
            }
          }}
        >
          <button
            type="button"
            onClick={() => commitSave(false)}
            disabled={!isDirty || saving !== ""}
            className="rounded-full border-2 border-jeon-ink px-3.5 py-1.5 text-xs font-bold text-app-ink transition-opacity disabled:opacity-40"
          >
            {saving === "save" ? t("dashboard.pages.linksBuilder.saving") : t("dashboard.pages.linksBuilder.save")}
          </button>
          <button
            type="button"
            onClick={() => commitSave(true)}
            disabled={saving !== ""}
            className="rounded-full bg-jeon-sidebar px-3.5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving === "publish" ? t("dashboard.pages.linksBuilder.saving") : t("dashboard.pages.linksBuilder.savePublish")}
          </button>
        </div>
      </div>
      {error && <p className="flex-shrink-0 bg-red-50 px-4 py-2 text-center text-xs text-red-600">{error}</p>}
      {/* grid-rows-[minmax(0,1fr)_minmax(0,1fr)] -- bug ditemukan lewat
          audit ROUND 2 (13 September 2026): di bawah breakpoint `lg`
          (tablet/HP, `grid-cols-1`), grid ini TIDAK PUNYA baris eksplisit
          sama sekali -- CSS Grid default `grid-auto-rows: auto` menyusun
          tinggi tiap baris berdasar KONTEN, bukan membagi tinggi grid yang
          sebenarnya sudah pasti (dari `flex-1` di parent flex-col). Kedua
          panel (BuilderLeftPanel/BuilderCanvas) sama-sama pakai `h-full` +
          scroll internal sendiri -- `h-full` yg resolve ke baris "auto"
          kehilangan tinggi pasti utk dibagi, scroll internal jadi tidak
          aktif & seluruh halaman (tanpa overflow-hidden di root) terpaksa
          tumbuh memuat SELURUH tree + SELURUH bingkai kanvas ditumpuk
          vertikal. `lg:grid-rows-1` mengembalikan ke satu baris implisit
          di desktop (sisi-bersisi, tidak perlu dibagi). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 p-3 lg:grid-cols-[420px_1fr] lg:grid-rows-1">
        <BuilderLeftPanel
          links={links}
          selection={selection}
          onSelectionChange={setSelection}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onClone={handleClone}
          onReorderRoot={handleReorderRoot}
          onReorderChildren={handleReorderChildren}
          onUpdateNode={handleUpdateNode}
          onMediaImageChanged={handleMediaImageChanged}
          onGalleryImagesChanged={handleGalleryImagesChanged}
          onAudioChanged={handleAudioChanged}
          onFileChanged={handleFileChanged}
          onEnsureRootPersisted={ensureRootPersisted}
          settingsHref="/dashboard/settings"
          page={designPage}
          isPremium={page.is_premium}
          onPatch={handlePatch}
          onLocalChange={handleDesignLocalChange}
          onStyleOverride={handleStyleOverride}
          onUploadAvatar={handleUploadAvatar}
          onUploadBackground={handleUploadBackground}
          onError={setError}
          stickers={page.stickers}
          onStickersChange={handleStickersChange}
          designSection={designSection}
          onDesignSectionChange={setDesignSection}
          products={products}
          onProductCreated={(p) => setProducts((prev) => [...prev, p])}
          pageType={extraPageType}
          productLayout={page.product_layout}
          onProductLayoutChange={handleProductLayoutChange}
        />
        <BuilderCanvas
          page={page}
          links={links}
          products={products}
          pageType={extraPageType}
          pageSlug={extraPageSlug}
          device={device}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          editableStickers={designSection === "stiker"}
          onStickersChange={handleStickersChange}
        />
      </div>
    </div>
  );
}
