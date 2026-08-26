"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  ExtraPage,
  MyPage,
  createBlock,
  createLink,
  createProduct,
  deleteLink,
  getMyPage,
  listLinks,
  listMyExtraPages,
  updateExtraPage,
  updateMyPage,
  updateProduct,
  uploadProductCover,
  uploadShowcaseImage,
} from "@/lib/api-client";
import { confirmDelete } from "@/lib/confirm";
import { PAGE_THEMES } from "@/lib/page-themes";
import { QUICK_SETUP_CATEGORIES, QUICK_SETUP_TEMPLATES, QuickSetupTemplate, orderedTemplateItems, buildQuickSetupPreviewData } from "@/lib/quick-setup-templates";
import { IconCheck, IconChevronRight, IconSearch } from "@/components/icons";
import ThemeGallery from "@/components/ThemeGallery";
import PagePreview, { PagePreviewData } from "@/components/PagePreview";

// LAYOUT_VARIANT_LABELS -- label deskriptif per varian utk ringkasan di
// panel pratinjau (lihat renderBioHeader, PagePreview.tsx, utk detail
// visual tiap varian).
const LAYOUT_VARIANT_LABELS: Record<
  "centered" | "banner" | "card" | "spotlight" | "cover" | "minimal" | "hero" | "polaroid" | "split" | "ticket" | "headline" | "ribbon" | "duo" | "masthead" | "portrait",
  string
> = {
  centered: "Centered (di tengah)",
  banner: "Banner (rata kiri sebaris)",
  card: "Card (dibungkus kartu, avatar menonjol)",
  spotlight: "Spotlight (avatar besar + badge nama)",
  cover: "Cover (pita sampul, avatar menindih tepi bawah)",
  minimal: "Minimal (avatar kecil sebaris nama)",
  hero: "Hero (foto profil besar edge-to-edge)",
  polaroid: "Polaroid (avatar kotak dibingkai & dimiringkan)",
  split: "Split (2 kolom, foto persegi kiri + identitas kanan)",
  ticket: "Ticket (dua bagian dipisah garis putus-putus ala tiket)",
  headline: "Headline (teks dulu, foto kecil menyusul di bawah)",
  ribbon: "Ribbon (badge aksen + nama dalam pita selebar penuh)",
  duo: "Duo (avatar+nama jadi satu chip pil ringkas)",
  masthead: "Masthead (pita warna berisi identitas langsung di dalamnya)",
  portrait: "Portrait (foto tegak dibingkai & berbayang ala poster)",
};

// buildPreviewData -- dipindah ke lib/quick-setup-templates.ts
// (buildQuickSetupPreviewData) supaya bisa dipakai bareng components/
// landing/Templates.tsx (homepage) juga, lihat catatan lengkap di sana.
// displayName di sini SELALU truthy (myPage?.display_name atau placeholder
// "Nama Kamu" dari pemanggil) -- permintaan langsung pengguna: "yang
// tampil di mockup itu bukan username tapi display name".
const buildPreviewData = buildQuickSetupPreviewData;

// pickAutoTokoPage -- Toko PERTAMA/auto tiap akun slug-nya SELALU =
// username (ensureProdukPage, backend), beda dari Toko ke-2..5 (khusus
// Premium, multi-brand, slug bebas sengaja dikustomisasi terpisah) --
// HANYA Toko auto yang ikut disinkronkan tema Quick Setup di bawah,
// supaya brand kedua/ketiga dst Premium tidak dipaksa ikut tema Bio.
function pickAutoTokoPage(pages: ExtraPage[], username: string): ExtraPage | null {
  return pages.find((p) => p.page_type === "produk" && p.slug === username) ?? null;
}

// fetchMyPageAndToko -- pengambil-data MURNI (tanpa setState), dipisah dari
// efek yang memanggilnya supaya lolos aturan react-hooks/set-state-in-effect
// (lihat pola resmi di CLAUDE.md).
async function fetchMyPageAndToko(): Promise<{ page: MyPage | null; tokoPage: ExtraPage | null }> {
  const page = await getMyPage().catch(() => null);
  if (!page) return { page: null, tokoPage: null };
  const pages = await listMyExtraPages().catch(() => [] as ExtraPage[]);
  return { page, tokoPage: pickAutoTokoPage(pages, page.username) };
}

// Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: "buatkan 1
// menu saja seperti quick setup dan user disuruh pilih jenis template...
// template ini bukan hanya visual tapi juga blok layout dll". Lihat catatan
// lingkup lengkap di lib/quick-setup-templates.ts (kenapa fitur monetisasi
// TIDAK dibuat otomatis, cuma disarankan lewat monetizationHint).
//
// Revisi 27 Agustus 2026 (permintaan langsung pengguna, dicontohkan lewat
// tangkapan layar alur "Microsite" s.id): dirombak dari satu halaman datar
// (search + chip kategori + grid gabungan + modal detail) jadi wizard 3
// langkah -- (1) pilih SATU kategori dulu di layar penuh, (2) tab
// "Template" (layout sesuai kategori) & "Theme" (opsional, ganti warna
// SAJA setelah template dipilih -- lihat previewTemplate di bawah kenapa
// ini aman: theme & layoutVariant sudah dua field independen sejak awal,
// tidak ada kopling tersembunyi), pratinjau persisten di kanan, (3) layar
// "generating" singkat lalu auto-redirect ke /dashboard/links (BUKAN
// tombol manual seperti sebelumnya) -- /dashboard/links sendiri sudah
// punya semua yang ditunjukkan editor komponen s.id (reorder drag, toggle
// aktif/nonaktif, hapus, "+ Tambah blok"), jadi tidak perlu UI editor
// baru di sini, cukup diarahkan ke sana. Pola auto-redirect-setelah-sukses
// diambil dari app/auth/instagram/callback & app/auth/tiktok/callback
// (satu-satunya preset yang sudah ada di proyek ini utk pola ini).
export default function QuickSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"category" | "build" | "generating">("category");
  const [category, setCategory] = useState<string | null>(null);
  const [tab, setTab] = useState<"template" | "theme">("template");
  const [query, setQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<QuickSetupTemplate | null>(null);
  // themeOverride -- null berarti "pakai tema bawaan template ini apa
  // adanya". Direset ke null tiap kali template BERBEDA dipilih -- template
  // "membawa" tema bawaannya sendiri, override cuma langkah tambahan yang
  // sengaja dilakukan kreator, bukan sesuatu yang harusnya "menempel" ke
  // template lain yang belum tentu cocok warnanya.
  const [themeOverride, setThemeOverride] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokoSynced, setTokoSynced] = useState(false);
  const [appliedMonetizationHint, setAppliedMonetizationHint] = useState<string | null>(null);
  // myPage -- dipakai HANYA supaya mockup pratinjau template pakai
  // username/nama tampilan/avatar akun sendiri (bukan placeholder generik).
  // display_name -- permintaan langsung pengguna: "yang tampil di mockup
  // itu bukan username tapi display name" -- kalau kreator belum mengisi
  // nama tampilan, jatuh ke placeholder "Nama Kamu" (lihat buildPreviewData).
  const [myPage, setMyPage] = useState<MyPage | null>(null);
  // tokoPage -- permintaan langsung pengguna, 19 Agustus 2026: "karena page
  // link bio dan toko terpisah saya mau buatkan juga template quick setup
  // untuk page toko nya". Toko AUTO kreator ini (kalau sudah ada) -- cuma
  // dipakai untuk catatan informatif di panel pratinjau ("tema Toko-mu juga
  // akan disesuaikan"), logika penerapan sesungguhnya di applyTemplate cek
  // ulang sendiri, tidak mengandalkan state ini.
  const [tokoPage, setTokoPage] = useState<ExtraPage | null>(null);

  const applyMyPageAndToko = useCallback((result: { page: MyPage | null; tokoPage: ExtraPage | null }) => {
    setMyPage(result.page);
    setTokoPage(result.tokoPage);
  }, []);

  useEffect(() => {
    fetchMyPageAndToko().then(applyMyPageAndToko);
  }, [applyMyPageAndToko]);

  // Auto-redirect setelah berhasil -- pola SAMA PERSIS dgn
  // app/auth/instagram/callback & app/auth/tiktok/callback (satu-satunya
  // preset "sukses lalu otomatis pindah halaman" yang sudah ada di proyek
  // ini). Timer dibersihkan di cleanup supaya tidak nyasar redirect kalau
  // komponen sempat unmount sebelum 1.5 detik berlalu.
  useEffect(() => {
    if (!generateSuccess) return;
    const timer = setTimeout(() => router.push("/dashboard/links"), 1500);
    return () => clearTimeout(timer);
  }, [generateSuccess, router]);

  // previewTemplate -- template terpilih dengan `theme` ditimpa override
  // (kalau ada). Ini SATU-SATUNYA sumber kebenaran baik untuk pratinjau
  // visual MAUPUN payload yang benar-benar diterapkan (applyTemplate
  // dipanggil dengan objek ini, bukan selectedTemplate mentah) -- supaya
  // apa yang kreator lihat di pratinjau selalu 100% sama dengan apa yang
  // tersimpan.
  const previewTemplate: QuickSetupTemplate | null = useMemo(() => {
    if (!selectedTemplate) return null;
    return themeOverride ? { ...selectedTemplate, theme: themeOverride } : selectedTemplate;
  }, [selectedTemplate, themeOverride]);

  const previewData: PagePreviewData | null = useMemo(() => {
    if (!previewTemplate) return null;
    return buildPreviewData(previewTemplate, myPage?.username ?? "namamu", myPage?.display_name || "Nama Kamu", myPage?.avatar_url ?? "");
  }, [previewTemplate, myPage]);

  const categoryTemplates = useMemo(() => {
    if (!category) return [];
    const q = query.trim().toLowerCase();
    return QUICK_SETUP_TEMPLATES.filter((t) => {
      if (t.category !== category) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
  }, [category, query]);

  function openCategory(key: string) {
    setCategory(key);
    setStep("build");
    setTab("template");
    setSelectedTemplate(null);
    setThemeOverride(null);
    setQuery("");
    setError(null);
  }

  function pickTemplate(t: QuickSetupTemplate) {
    setSelectedTemplate(t);
    setThemeOverride(null);
  }

  async function applyTemplate(t: QuickSetupTemplate) {
    setError(null);
    setSubmitting(true);
    try {
      // Bug dilaporkan pengguna: memilih template SEBELUMNYA cuma
      // MENAMBAH tautan/blok baru di atas yang sudah ada -- kalau kreator
      // coba beberapa template berturut-turut, sisa tautan template
      // sebelumnya menumpuk terus. Template seharusnya membuat halaman
      // JADI SEPERTI template itu (mengganti), bukan mencampur beberapa
      // template sekaligus. Tautan/blok LAMA dihapus dulu sebelum starter
      // template baru dibuat -- destruktif, jadi WAJIB dikonfirmasi kalau
      // ada isi yang bakal hilang (skip dialog kalau memang belum ada
      // tautan sama sekali, tidak ada yang perlu dikonfirmasi).
      const existing = await listLinks();
      const page = await getMyPage();
      const extraPagesBefore = await listMyExtraPages().catch(() => [] as ExtraPage[]);
      const tokoBefore = pickAutoTokoPage(extraPagesBefore, page.username);

      if (existing.length > 0) {
        // Produk (kalau template ini punya) SENGAJA tidak disebut sebagai
        // sesuatu yang "diganti" -- beda dari tautan/blok, produk baru
        // MENAMBAH ke daftar produk yang sudah ada, bukan menimpanya.
        const productNote = t.products && t.products.length > 0 ? ` Template ini juga akan menambah ${t.products.length} produk contoh (draft) di menu Toko.` : "";
        const tokoNote = tokoBefore ? " Tema Halaman Toko-mu juga akan ikut disesuaikan mengikuti tema template ini." : "";
        const ok = await confirmDelete(
          `Menerapkan template "${t.label}" akan menghapus ${existing.length} tautan/blok yang sudah ada saat ini, lalu menggantinya dengan tautan starter template ini.${productNote}${tokoNote}`,
          { title: "Ganti semua tautan?", confirmButtonText: "Ya, Ganti" }
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }

      // Begitu dikonfirmasi (atau tidak ada yang perlu dikonfirmasi),
      // langsung pindah ke layar "generating" -- sisa proses di bawah
      // berjalan di baliknya.
      setStep("generating");

      for (const l of existing) {
        await deleteLink(l.id);
      }

      // Bio kreator yang SUDAH diisi tidak boleh ditimpa diam-diam --
      // saran bio template cuma dipakai kalau bio masih kosong.
      // layout_variant SELALU ikut diterapkan (bukan cuma kalau bio
      // kosong) -- ini bagian dari "bentuk" template, sama seperti tema.
      const layoutVariant = t.layoutVariant ?? "centered";
      // social -- permintaan langsung pengguna, 24 Agustus 2026 (baris
      // ikon GitHub/LinkedIn/Website/Email, contoh template "Dimas Dev").
      // Nilai PLACEHOLDER jelas contoh -- kreator tinggal lengkapi lewat
      // panel Kontak Sosial. Object.fromEntries -- t.social pakai key
      // pendek ("github"), updateMyPage butuh key kolom DB ("social_github").
      const socialPatch = t.social ? Object.fromEntries(Object.entries(t.social).map(([k, v]) => [`social_${k}`, v])) : {};
      await updateMyPage(
        page.bio.trim()
          ? { theme: t.theme, layout_variant: layoutVariant, ...socialPatch }
          : { theme: t.theme, bio: t.bio, layout_variant: layoutVariant, ...socialPatch }
      );

      // Sequential (bukan Promise.all) -- posisi tautan dihitung server-side
      // dari MAX(position)+1 tiap insert (links & blocks BERBAGI kolom
      // position yang sama di tabel `links`), permintaan paralel berisiko
      // dua item kebetulan dapat posisi yang sama. Satu loop mengikuti
      // orderedTemplateItems APA ADANYA -- SATU sumber kebenaran urutan,
      // sama persis dengan yang ditampilkan pratinjau.
      for (const item of orderedTemplateItems(t)) {
        if (item.blockType === "link") {
          await createLink({ title: item.title, url: item.url, description: item.description });
        } else if (item.blockType === "maps") {
          await createBlock({ block_type: "maps", title: item.title, url: item.url, block_data: { embed: false } });
        } else if (item.blockType === "faq") {
          await createBlock({ block_type: "faq", title: item.title, block_data: { items: item.faqItems } });
        } else if (item.blockType === "project_showcase") {
          // "project_showcase" -- gambarnya aset statis milik Jeonme
          // sendiri (showcaseImagePath), TIDAK bisa dikirim langsung
          // sebagai block_data.image_url (backend mewajibkan URL http(s)
          // absolut, path relatif ditolak validator) -- pola SAMA PERSIS
          // dengan cover produk di bawah: buat blok DULU (tanpa gambar),
          // fetch aset statis sebagai blob, lalu unggah ulang lewat
          // endpoint yang mengembalikan URL storage absolut.
          const created = await createBlock({
            block_type: "project_showcase",
            title: item.title,
            url: item.url,
            block_data: { badge_text: item.badgeText ?? "", cta_text: item.ctaText ?? "" },
            description: item.description,
          });
          if (item.showcaseImagePath) {
            try {
              const res = await fetch(item.showcaseImagePath);
              const blob = await res.blob();
              const file = new File([blob], `${item.title}.jpg`, { type: blob.type || "image/jpeg" });
              await uploadShowcaseImage(created.id, file);
            } catch {
              // diamkan -- blok "Project Unggulan" yang SUDAH dibuat di atas
              // tetap berhasil walau gambarnya gagal terpasang, sama seperti
              // soft-fail sampul produk di bawah.
            }
          }
        } else {
          await createBlock({
            block_type: item.blockType,
            title: item.title,
            block_data: item.blockType === "text" ? { text: item.text } : {},
          });
        }
      }

      // products -- susulan permintaan pengguna: "tambahkan template untuk
      // produk yang siap pakai juga". BEDA dari tautan/blok di atas: TIDAK
      // PERNAH dihapus/ditimpa (produk lama milik kreator dibiarkan apa
      // adanya, cuma ditambah) -- lihat catatan lengkap di
      // QuickSetupTemplateProduct kenapa ini aman & tidak destruktif.
      for (const p of t.products ?? []) {
        const created = await createProduct({ name: p.name, description: p.description, price_idr: p.priceIDR, product_kind: p.productKind });
        // Sampul produk -- susulan permintaan pengguna: "buat gambar
        // product nya ambil dari sumber online yang free saja" -- aset
        // statis SAMA ORIGIN, di-fetch sebagai blob lalu diunggah ulang
        // lewat endpoint cover yang sudah ada (backend butuh multipart
        // file, bukan URL eksternal). Soft-fail -- produk yang SUDAH
        // dibuat di atas tetap berhasil walau foto sampulnya gagal terpasang.
        let coverUploaded = false;
        if (p.coverImagePath) {
          try {
            const res = await fetch(p.coverImagePath);
            const blob = await res.blob();
            const file = new File([blob], `${p.name}.jpg`, { type: blob.type || "image/jpeg" });
            await uploadProductCover(created.id, file);
            coverUploaded = true;
          } catch {
            // diamkan -- lihat catatan soft-fail di atas.
          }
        }
        // Aktivasi payment_link -- sejak sampul jadi wajib untuk SEMUA
        // jenis produk, Create tidak lagi mengaktifkan payment_link
        // otomatis -- tanpa baris ini, produk contoh food-beverage akan
        // diam-diam jadi draft, padahal sampulnya SUDAH ada di sini.
        if (p.productKind === "payment_link" && coverUploaded) {
          try {
            await updateProduct(created.id, { is_active: true });
          } catch {
            // soft-fail -- produk tetap ada sebagai draft, kreator bisa
            // aktifkan manual lewat Manage Items kalau ini gagal.
          }
        }
      }

      // Sinkron tema Halaman Toko -- permintaan langsung pengguna, 19
      // Agustus 2026. Lookup diulang di sini (bukan pakai tokoBefore)
      // supaya Toko yang BARU SAJA otomatis terbuat (ensureProdukPage,
      // dipicu produk pertama loop di atas) juga tercakup.
      const extraPagesAfter = await listMyExtraPages().catch(() => [] as ExtraPage[]);
      const tokoAfter = pickAutoTokoPage(extraPagesAfter, page.username);
      if (tokoAfter) {
        try {
          await updateExtraPage(tokoAfter.id, { theme: t.theme, layout_variant: layoutVariant });
        } catch {
          // soft-fail -- Bio & produk tetap berhasil diterapkan, kreator
          // bisa samakan tema Toko manual lewat menu Produk kalau ini gagal.
        }
      }
      setTokoSynced(tokoAfter !== null);
      setAppliedMonetizationHint(t.monetizationHint ?? null);
      setGenerateSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menerapkan template, coba lagi.");
      setStep("build");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Step 1: pilih kategori ----------
  if (step === "category") {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="mt-1 text-sm text-muted">
          Pilih kategori yang paling cocok dengan halamanmu -- template & tema di langkah berikutnya disaring sesuai kategori ini.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_SETUP_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => openCategory(c.key)}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-white p-5 text-center shadow-card transition-transform hover:-translate-y-0.5 hover:border-primary"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
                <c.Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-bold text-ink">{c.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Step 3: generating + auto-redirect ----------
  if (step === "generating") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
        {!generateSuccess ? (
          <>
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary-subtle border-t-primary" aria-hidden />
            <p className="mt-4 font-heading text-lg font-bold text-ink">Menyiapkan halamanmu...</p>
            <p className="mt-1 text-sm text-muted">Menerapkan tema, tautan, dan blok starter.</p>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
              <IconCheck className="h-6 w-6" />
            </span>
            <p className="mt-4 font-heading text-lg font-bold text-ink">Template diterapkan!</p>
            <p className="mt-1 text-sm text-muted">Mengalihkan ke Link Bio untuk melengkapi tautan asli kamu...</p>
            {tokoSynced && <p className="mt-2 text-xs text-muted">Tema Halaman Toko-mu juga sudah ikut disesuaikan.</p>}
            {appliedMonetizationHint && (
              <p className="mt-3 max-w-sm rounded-xl bg-primary-subtle px-4 py-3 text-xs font-semibold text-primary">{appliedMonetizationHint}</p>
            )}
          </>
        )}
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  // ---------- Step 2: pilih Template lalu (opsional) Theme ----------
  const activeCategory = QUICK_SETUP_CATEGORIES.find((c) => c.key === category);

  return (
    <div className="mx-auto max-w-6xl">
      <button
        type="button"
        onClick={() => setStep("category")}
        className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary-subtle px-3 py-1.5 text-xs font-bold text-primary transition-transform hover:-translate-x-0.5"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        Ganti Kategori
      </button>
      <p className="mt-2 text-sm text-muted">
        Kategori: <span className="font-semibold text-ink">{activeCategory?.label}</span> -- pilih template, lalu opsional ganti temanya
        di tab Theme.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_300px] lg:items-start">
        <div>
          <div className="flex gap-2 border-b border-border">
            <button
              type="button"
              onClick={() => setTab("template")}
              className={`border-b-2 px-3 py-2 text-sm font-semibold ${
                tab === "template" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Template
            </button>
            {/* Tab "Theme" sengaja dikunci sampai template dipilih --
                permintaan langsung pengguna: "setelah pilih template user
                baru bisa pindah ke tab theme (optional)". */}
            <button
              type="button"
              disabled={!selectedTemplate}
              onClick={() => selectedTemplate && setTab("theme")}
              title={!selectedTemplate ? "Pilih template dulu" : undefined}
              className={`border-b-2 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === "theme" ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              Theme
            </button>
          </div>

          {tab === "template" && (
            <>
              <div className="relative mt-4">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari template di kategori ini..."
                  className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-ink focus:border-primary focus:outline-none"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categoryTemplates.map((t) => (
                  // div role="button" -- BUKAN <button> sungguhan: PagePreview
                  // di dalamnya merender ShareButton (elemen <button>
                  // sendiri), dan <button> di dalam <button> itu HTML TIDAK
                  // VALID -- browser otomatis "meratakan" nesting itu, event
                  // klik jadi kacau. tabIndex+onKeyDown menjaga tetap bisa
                  // diakses keyboard.
                  <div
                    key={t.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickTemplate(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickTemplate(t);
                      }
                    }}
                    className={`flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-card transition-transform hover:-translate-y-0.5 ${
                      selectedTemplate?.key === t.key ? "border-primary ring-2 ring-primary ring-offset-2" : "border-border"
                    }`}
                  >
                    <div className="relative h-64 w-full overflow-hidden bg-white pointer-events-none" aria-hidden="true">
                      <div className="h-full [zoom:0.36]">
                        <PagePreview
                          interactive={false}
                          rootClassName="min-h-full"
                          data={buildPreviewData(t, myPage?.username ?? "namamu", myPage?.display_name || "Nama Kamu", myPage?.avatar_url ?? "")}
                        />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="font-heading text-sm font-bold text-ink">{t.label}</p>
                      <p className="mt-1 text-xs text-muted">{t.description}</p>
                    </div>
                  </div>
                ))}
                {categoryTemplates.length === 0 && (
                  <p className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
                    Tidak ada template yang cocok dengan pencarianmu.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "theme" && selectedTemplate && (
            <div className="mt-4">
              <ThemeGallery value={previewTemplate?.theme ?? selectedTemplate.theme} onChange={setThemeOverride} />
            </div>
          )}
        </div>

        {/* Panel pratinjau persisten -- permintaan langsung pengguna:
            "dibagian kanan nya ditampilkan bentuk template dan theme yang
            dipilih seperti pratinjau yang sudah ada". Beda dari modal
            sebelumnya, panel ini SELALU terlihat di kolom kanan sepanjang
            step ini, memperbarui diri begitu template ATAU tema berganti. */}
        <div className="lg:sticky lg:top-4">
          <div className="mx-auto h-[420px] w-full max-w-[220px] overflow-y-auto rounded-2xl border border-border shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {previewData ? (
              <div className="h-full [zoom:0.55]">
                <PagePreview interactive={false} rootClassName="min-h-full" data={previewData} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted">
                Pilih template di sebelah kiri untuk lihat pratinjaunya di sini.
              </div>
            )}
          </div>

          {selectedTemplate && (
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div>
                <p className="font-heading text-base font-bold text-ink">{selectedTemplate.label}</p>
                <p className="mt-1 text-xs text-muted">{selectedTemplate.description}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Tema</p>
                <p className="mt-0.5 text-ink">{PAGE_THEMES[(previewTemplate?.theme ?? selectedTemplate.theme) as keyof typeof PAGE_THEMES]?.label ?? selectedTemplate.theme}</p>
                {tokoPage && <p className="mt-0.5 text-[11px] text-muted">Tema Halaman Toko-mu juga akan ikut disesuaikan.</p>}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Layout</p>
                <p className="mt-0.5 text-ink">{LAYOUT_VARIANT_LABELS[selectedTemplate.layoutVariant ?? "centered"]}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted">Tautan Starter ({selectedTemplate.links.length})</p>
                <p className="mt-0.5 text-[11px] text-muted">Menggantikan SEMUA tautan/blok yang sudah ada saat ini di Link Bio.</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {selectedTemplate.links.map((l) => (
                    <li key={l.title} className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
                      {l.title}
                    </li>
                  ))}
                </ul>
              </div>
              {selectedTemplate.blocks && selectedTemplate.blocks.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Blok Konten</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {selectedTemplate.blocks.map((b) => (
                      <li key={b.title} className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
                        {b.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedTemplate.products && selectedTemplate.products.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Produk Siap Pakai</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {selectedTemplate.products.map((p) => (
                      <li key={p.name} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-dark">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted">Dibuat sebagai draft di menu Toko -- belum aktif/bisa dibeli.</p>
                </div>
              )}
              {selectedTemplate.monetizationHint && (
                <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs font-semibold text-accent-dark">{selectedTemplate.monetizationHint}</p>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => selectedTemplate && applyTemplate(previewTemplate ?? selectedTemplate)}
            disabled={!selectedTemplate || submitting}
            className="mt-4 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Memeriksa..." : "Terapkan Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
