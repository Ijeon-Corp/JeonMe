"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import IconBadge, { accentForIndex } from "@/components/IconBadge";
import { QUICK_SETUP_CATEGORIES, QUICK_SETUP_TEMPLATES, QuickSetupTemplate, orderedTemplateItems, buildQuickSetupPreviewData } from "@/lib/quick-setup-templates";
import { IconCheck, IconChevronRight, IconSearch } from "@/components/icons";
import ThemeGallery from "@/components/ThemeGallery";
import type { PagePreviewData } from "@/components/PagePreview";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// PagePreview.tsx -- lihat catatan di components/LivePreviewPanel.tsx,
// sama-sama di-dynamic-import supaya bundle awal halaman ini lebih kecil.
const PagePreview = dynamic(() => import("@/components/PagePreview"));

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

// fetchMyPage -- pengambil-data MURNI (tanpa setState), dipisah dari efek
// yang memanggilnya supaya lolos aturan react-hooks/set-state-in-effect
// (lihat pola resmi di CLAUDE.md).
async function fetchMyPage(): Promise<MyPage | null> {
  return getMyPage().catch(() => null);
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
  const { t } = useLocale();
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
  useErrorToast(error);
  const [tokoSynced, setTokoSynced] = useState(false);
  const [appliedMonetizationHint, setAppliedMonetizationHint] = useState<string | null>(null);
  // myPage -- dipakai HANYA supaya mockup pratinjau template pakai
  // username/nama tampilan/avatar akun sendiri (bukan placeholder generik).
  // display_name -- permintaan langsung pengguna: "yang tampil di mockup
  // itu bukan username tapi display name" -- kalau kreator belum mengisi
  // nama tampilan, jatuh ke placeholder "Nama Kamu" (lihat buildPreviewData).
  const [myPage, setMyPage] = useState<MyPage | null>(null);

  useEffect(() => {
    fetchMyPage().then(setMyPage);
  }, []);

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
    return buildPreviewData(previewTemplate, myPage?.username ?? t("dashboard.pages.quickSetup.usernamePlaceholder"), myPage?.display_name || t("dashboard.pages.quickSetup.namePlaceholder"), myPage?.avatar_url ?? "");
  }, [previewTemplate, myPage, t]);

  const categoryTemplates = useMemo(() => {
    if (!category) return [];
    const q = query.trim().toLowerCase();
    return QUICK_SETUP_TEMPLATES.filter((tpl) => {
      if (tpl.category !== category) return false;
      if (!q) return true;
      return tpl.label.toLowerCase().includes(q) || tpl.description.toLowerCase().includes(q);
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

  function pickTemplate(tmpl: QuickSetupTemplate) {
    setSelectedTemplate(tmpl);
    setThemeOverride(null);
  }

  // applyTemplate -- parameter DINAMAI "tmpl" (bukan "t" lagi seperti
  // sebelumnya): permintaan susulan pengguna (29 Agustus 2026,
  // terjemahkan seluruh isi dashboard) menambahkan `t` dari useLocale()
  // di scope komponen ini -- parameter "t: QuickSetupTemplate" yang lama
  // akan MENIMPA (shadow) fungsi terjemahan itu di seluruh badan fungsi
  // ini, jadi WAJIB diganti nama supaya t() tetap bisa dipanggil di sini.
  async function applyTemplate(tmpl: QuickSetupTemplate) {
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
        const productNote =
          tmpl.products && tmpl.products.length > 0
            ? t("dashboard.pages.quickSetup.productNoteTemplate").replace("{count}", String(tmpl.products.length))
            : "";
        const tokoNote = tokoBefore ? t("dashboard.pages.quickSetup.tokoNoteText") : "";
        const ok = await confirmDelete(
          t("dashboard.pages.quickSetup.confirmReplaceText")
            .replace("{label}", tmpl.label)
            .replace("{count}", String(existing.length)) + productNote + tokoNote,
          { title: t("dashboard.pages.quickSetup.confirmReplaceTitle"), confirmButtonText: t("dashboard.pages.quickSetup.confirmReplaceButton") }
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
      const layoutVariant = tmpl.layoutVariant ?? "centered";
      // social -- permintaan langsung pengguna, 24 Agustus 2026 (baris
      // ikon GitHub/LinkedIn/Website/Email, contoh template "Dimas Dev").
      // Nilai PLACEHOLDER jelas contoh -- kreator tinggal lengkapi lewat
      // panel Kontak Sosial. Object.fromEntries -- tmpl.social pakai key
      // pendek ("github"), updateMyPage butuh key kolom DB ("social_github").
      const socialPatch = tmpl.social ? Object.fromEntries(Object.entries(tmpl.social).map(([k, v]) => [`social_${k}`, v])) : {};
      await updateMyPage(
        page.bio.trim()
          ? { theme: tmpl.theme, layout_variant: layoutVariant, ...socialPatch }
          : { theme: tmpl.theme, bio: tmpl.bio, layout_variant: layoutVariant, ...socialPatch }
      );

      // Sequential (bukan Promise.all) -- posisi tautan dihitung server-side
      // dari MAX(position)+1 tiap insert (links & blocks BERBAGI kolom
      // position yang sama di tabel `links`), permintaan paralel berisiko
      // dua item kebetulan dapat posisi yang sama. Satu loop mengikuti
      // orderedTemplateItems APA ADANYA -- SATU sumber kebenaran urutan,
      // sama persis dengan yang ditampilkan pratinjau.
      for (const item of orderedTemplateItems(tmpl)) {
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
      for (const p of tmpl.products ?? []) {
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
          await updateExtraPage(tokoAfter.id, { theme: tmpl.theme, layout_variant: layoutVariant });
        } catch {
          // soft-fail -- Bio & produk tetap berhasil diterapkan, kreator
          // bisa samakan tema Toko manual lewat menu Produk kalau ini gagal.
        }
      }
      setTokoSynced(tokoAfter !== null);
      setAppliedMonetizationHint(tmpl.monetizationHint ?? null);
      setGenerateSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.quickSetup.applyError"));
      setStep("build");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- Step 1: pilih kategori ----------
  if (step === "category") {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.quickSetup.step1Intro")}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_SETUP_CATEGORIES.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={() => openCategory(c.key)}
              className="flex flex-col items-center gap-2.5 rounded-jmd border-2 border-jeon-ink bg-app-surface p-5 text-center shadow-card transition-transform hover:-translate-y-0.5 hover:border-jeon-purple"
            >
              {/* accentForIndex: kartu kategori berjejer dalam grid, jadi warnanya
                  dirotasi seperti kartu fitur homepage supaya tidak terasa datar
                  (permintaan pengguna 1 September 2026 soal ikon dashboard). */}
              <IconBadge icon={c.Icon} accent={accentForIndex(i)} />
              <span className="text-sm font-bold text-app-ink">{c.label}</span>
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
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-jeon-purple-subtle border-t-primary" aria-hidden />
            <p className="mt-4 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.quickSetup.generatingTitle")}</p>
            <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.quickSetup.generatingDesc")}</p>
          </>
        ) : (
          <>
            <IconBadge icon={IconCheck} accent="lime" size="lg" />
            <p className="mt-4 font-display text-lg font-bold text-app-ink">{t("dashboard.pages.quickSetup.successTitle")}</p>
            <p className="mt-1 text-sm text-app-muted">{t("dashboard.pages.quickSetup.successDesc")}</p>
            {tokoSynced && <p className="mt-2 text-xs text-app-muted">{t("dashboard.pages.quickSetup.tokoSyncedNote")}</p>}
            {appliedMonetizationHint && (
              <p className="mt-3 max-w-sm rounded-xl bg-jeon-purple/10 px-4 py-3 text-xs font-semibold text-jeon-purple">{appliedMonetizationHint}</p>
            )}
          </>
        )}
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
        className="mb-1 inline-flex items-center gap-1 rounded-full border-2 border-[#111111] bg-jeon-lavender px-3 py-1.5 text-xs font-bold text-[#111111] transition-transform hover:-translate-x-0.5"
      >
        <IconChevronRight className="h-3.5 w-3.5 rotate-180" />
        {t("dashboard.pages.quickSetup.changeCategoryButton")}
      </button>
      <p className="mt-2 text-sm text-app-muted">
        {t("dashboard.pages.quickSetup.categoryPrefix")} <span className="font-semibold text-app-ink">{activeCategory?.label}</span>{" "}
        {t("dashboard.pages.quickSetup.categorySuffix")}
      </p>


      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("template")}
              className={`border-b-[3px] px-3 py-2 text-sm font-semibold ${
                tab === "template" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.pages.quickSetup.templateTab")}
            </button>
            {/* Tab "Theme" sengaja dikunci sampai template dipilih --
                permintaan langsung pengguna: "setelah pilih template user
                baru bisa pindah ke tab theme (optional)". */}
            <button
              type="button"
              disabled={!selectedTemplate}
              onClick={() => selectedTemplate && setTab("theme")}
              title={!selectedTemplate ? t("dashboard.pages.quickSetup.selectTemplateFirstTitle") : undefined}
              className={`border-b-[3px] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                tab === "theme" ? "border-jeon-purple text-jeon-purple" : "border-transparent text-app-muted hover:text-app-ink"
              }`}
            >
              {t("dashboard.pages.quickSetup.themeTab")}
            </button>
          </div>

          {tab === "template" && (
            <>
              <div className="relative mt-4">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("dashboard.pages.quickSetup.searchPlaceholder")}
                  className="w-full rounded-xl border border-app-border bg-app-surface py-2.5 pl-9 pr-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {categoryTemplates.map((tpl) => (
                  // div role="button" -- BUKAN <button> sungguhan: PagePreview
                  // di dalamnya merender ShareButton (elemen <button>
                  // sendiri), dan <button> di dalam <button> itu HTML TIDAK
                  // VALID -- browser otomatis "meratakan" nesting itu, event
                  // klik jadi kacau. tabIndex+onKeyDown menjaga tetap bisa
                  // diakses keyboard. Nama parameter "tpl" (bukan "t") --
                  // sama seperti applyTemplate, supaya tidak menimpa t()
                  // dari useLocale() di scope komponen ini.
                  <div
                    key={tpl.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickTemplate(tpl)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        pickTemplate(tpl);
                      }
                    }}
                    className={`flex cursor-pointer flex-col overflow-hidden rounded-jmd border bg-app-surface text-left shadow-card transition-transform hover:-translate-y-0.5 ${
                      selectedTemplate?.key === tpl.key ? "border-jeon-purple ring-2 ring-jeon-purple ring-offset-2" : "border-app-border"
                    }`}
                  >
                    <div className="relative h-64 w-full overflow-hidden bg-app-surface pointer-events-none" aria-hidden="true">
                      <div className="h-full [zoom:0.36]">
                        <PagePreview
                          interactive={false}
                          rootClassName="min-h-full"
                          data={buildPreviewData(tpl, myPage?.username ?? t("dashboard.pages.quickSetup.usernamePlaceholder"), myPage?.display_name || t("dashboard.pages.quickSetup.namePlaceholder"), myPage?.avatar_url ?? "")}
                        />
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="font-display text-sm font-bold text-app-ink">{tpl.label}</p>
                      <p className="mt-1 text-xs text-app-muted">{tpl.description}</p>
                    </div>
                  </div>
                ))}
                {categoryTemplates.length === 0 && (
                  <p className="col-span-full rounded-xl border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
                    {t("dashboard.pages.quickSetup.noResultsMessage")}
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
            step ini, memperbarui diri begitu template ATAU tema berganti.
            Ringkasan tema/layout/tautan/blok/produk di bawah pratinjau
            DIHAPUS TOTAL (permintaan susulan langsung pengguna: "hilangkan
            semua ini yang ada di bawah pratinjau, hanya ada tombol
            terapkan template saja, dan buat pratinjau jadi lebih besar")
            -- cuma tombol "Terapkan Template" yang tersisa, kotak
            pratinjau dilebarkan/ditinggikan mengisi ruang yang kosong
            (rasio zoom:tinggi kotak dijaga SAMA -- 400px lebar layout
            efektif -- supaya PagePreview tetap merender proporsional,
            cuma fisiknya lebih besar). */}
        <div className="lg:sticky lg:top-4">
          <div className="mx-auto h-[640px] w-full max-w-[300px] overflow-y-auto rounded-jmd border-2 border-jeon-ink shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {previewData ? (
              <div className="h-full [zoom:0.75]">
                <PagePreview interactive={false} rootClassName="min-h-full" data={previewData} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-xs text-app-muted">
                {t("dashboard.pages.quickSetup.selectTemplatePrompt")}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => selectedTemplate && applyTemplate(previewTemplate ?? selectedTemplate)}
            disabled={!selectedTemplate || submitting}
            className="mt-4 w-full rounded-full btn-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? t("dashboard.pages.quickSetup.checkingButton") : t("dashboard.pages.quickSetup.applyTemplateButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
