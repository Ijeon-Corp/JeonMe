"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
import { IconCheck, IconSearch } from "@/components/icons";
import PagePreview, { PagePreviewData } from "@/components/PagePreview";

// LAYOUT_VARIANT_LABELS -- label deskriptif per varian untuk modal
// pratinjau (lihat renderBioHeader, PagePreview.tsx, untuk detail visual
// tiap varian). "hero"/"polaroid" sempat KETINGGALAN di sini (ditambah ke
// renderBioHeader/QuickSetupTemplate.layoutVariant tapi lupa disusulkan ke
// map ini) -- ditemukan & diperbaiki 13 Agustus 2026 saat memberi tiap
// kategori Quick Setup varian layout unik.
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
// (lihat pola resmi di CLAUDE.md) -- dipakai HANYA untuk memberi tahu di
// modal pratinjau kalau kreator ini sudah punya Toko auto, yang berarti
// temanya juga akan ikut disesuaikan begitu template diterapkan (lihat
// applyTemplate). Cek ULANG yang OTORITATIF (bukan pakai state basi ini)
// tetap dilakukan di applyTemplate sendiri saat benar-benar diterapkan.
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
export default function QuickSetupPage() {
  const router = useRouter();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<QuickSetupTemplate | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<QuickSetupTemplate | null>(null);
  // myPage -- dipakai HANYA supaya mockup pratinjau template pakai
  // username/nama tampilan/avatar akun sendiri (bukan placeholder generik),
  // tidak dipakai untuk apa pun selain itu di halaman ini (pengecekan
  // bio-kosong saat menerapkan tetap fetch ulang di applyTemplate supaya
  // datanya terbaru). display_name -- permintaan langsung pengguna: "yang
  // tampil di mockup itu bukan username tapi display name" -- kalau
  // kreator belum mengisi nama tampilan, jatuh ke placeholder "Nama Kamu"
  // (lihat buildPreviewData), BUKAN ke username seperti sebelumnya.
  const [myPage, setMyPage] = useState<MyPage | null>(null);
  // tokoPage -- permintaan langsung pengguna, 19 Agustus 2026: "karena page
  // link bio dan toko terpisah saya mau buatkan juga template quick setup
  // untuk page toko nya". Toko AUTO kreator ini (kalau sudah ada) -- cuma
  // dipakai untuk catatan informatif di modal pratinjau ("tema Toko-mu juga
  // akan disesuaikan"), logika penerapan sesungguhnya di applyTemplate cek
  // ulang sendiri, tidak mengandalkan state ini.
  const [tokoPage, setTokoPage] = useState<ExtraPage | null>(null);
  const [tokoSynced, setTokoSynced] = useState(false);

  const applyMyPageAndToko = useCallback((result: { page: MyPage | null; tokoPage: ExtraPage | null }) => {
    setMyPage(result.page);
    setTokoPage(result.tokoPage);
  }, []);

  useEffect(() => {
    fetchMyPageAndToko().then(applyMyPageAndToko);
  }, [applyMyPageAndToko]);

  // Permintaan langsung pengguna: "harusnya saat pilih template kasih
  // liat preview nyaa" -- mockup VISUAL (komponen PagePreview yang sama
  // dipakai Pratinjau Langsung di seluruh dashboard), bukan cuma daftar
  // teks tema/tautan seperti sebelumnya. Dibangun langsung dari data
  // template (belum tersimpan ke mana pun) supaya bisa dilihat SEBELUM
  // memutuskan menerapkan.
  const previewData: PagePreviewData | null = useMemo(() => {
    if (!selected) return null;
    return buildPreviewData(selected, myPage?.username ?? "namamu", myPage?.display_name || "Nama Kamu", myPage?.avatar_url ?? "");
  }, [selected, myPage]);

  // Urutan tampil di grid -- permintaan langsung pengguna, 26 Agustus
  // 2026: "yang tampil per baris itu harus sama semua tipe layout jangan
  // random perbaris beda beda karna bikin jelek". Grid galeri di bawah
  // responsif (2/3/4 kolom) & merender mockup PagePreview SUNGGUHAN per
  // kartu -- tanpa pengurutan, dua template BERSEBELAHAN di array bisa
  // punya layoutVariant BEDA (mis. kategori Creator: creator-profile/
  // influencer/personal-branding/public-figure semua "hero", TAPI
  // islamic-creator (juga "hero") muncul SETELAH sepasang "portrait"
  // streamer/gamer -- baris ke-2 di grid 4 kolom jadi campur
  // portrait+portrait+hero+headline, bentuk mockup beda-beda dalam satu
  // baris, persis keluhan pengguna). category tetap jadi kunci urutan
  // UTAMA (pakai urutan QUICK_SETUP_CATEGORIES, bukan alfabet) supaya
  // kategori tidak ikut tercampur saat filter "Semua" aktif -- layoutVariant
  // jadi kunci KEDUA supaya template berbentuk mockup sama selalu
  // bersebelahan, apa pun jumlah kolom grid saat ini.
  const categoryRank = useMemo(() => new Map(QUICK_SETUP_CATEGORIES.map((c, i) => [c.key, i])), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = QUICK_SETUP_TEMPLATES.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
    return [...matched].sort((a, b) => {
      const catDiff = (categoryRank.get(a.category) ?? 0) - (categoryRank.get(b.category) ?? 0);
      if (catDiff !== 0) return catDiff;
      return (a.layoutVariant ?? "centered").localeCompare(b.layoutVariant ?? "centered");
    });
  }, [category, query, categoryRank]);

  async function applyTemplate(t: QuickSetupTemplate) {
    setError(null);
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
        // tokoNote -- permintaan langsung pengguna: "buatkan juga template
        // quick setup untuk page toko nya" -- lihat catatan lengkap di
        // pickAutoTokoPage/fetchMyPageAndToko soal kenapa cuma Toko auto.
        const tokoNote = tokoBefore ? " Tema Halaman Toko-mu juga akan ikut disesuaikan mengikuti tema template ini." : "";
        const ok = await confirmDelete(
          `Menerapkan template "${t.label}" akan menghapus ${existing.length} tautan/blok yang sudah ada saat ini, lalu menggantinya dengan tautan starter template ini.${productNote}${tokoNote}`,
          { title: "Ganti semua tautan?", confirmButtonText: "Ya, Ganti" }
        );
        if (!ok) return;
      }

      setApplying(true);

      for (const l of existing) {
        await deleteLink(l.id);
      }

      // Bio kreator yang SUDAH diisi tidak boleh ditimpa diam-diam --
      // saran bio template cuma dipakai kalau bio masih kosong. `page`
      // dari fetch di atas (sebelum dialog konfirmasi) dipakai lagi di sini
      // -- bio tidak realistis berubah selagi dialog konfirmasi terbuka di
      // tab yang sama, jadi tidak perlu fetch ulang.
      // layout_variant SELALU ikut diterapkan (bukan cuma kalau bio
      // kosong) -- ini bagian dari "bentuk" template, sama seperti tema.
      const layoutVariant = t.layoutVariant ?? "centered";
      // social -- permintaan langsung pengguna, 24 Agustus 2026 (baris
      // ikon GitHub/LinkedIn/Website/Email, contoh template "Dimas Dev").
      // Nilai PLACEHOLDER jelas contoh (sama semangatnya dengan bio/tautan
      // starter di atas) -- kreator tinggal lengkapi lewat panel Kontak
      // Sosial. Object.fromEntries -- t.social pakai key pendek ("github"),
      // updateMyPage butuh key kolom DB ("social_github").
      const socialPatch = t.social
        ? Object.fromEntries(Object.entries(t.social).map(([k, v]) => [`social_${k}`, v]))
        : {};
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
      // sama persis dengan yang ditampilkan pratinjau (maps di atas,
      // tautan di tengah, blok lain di bawah, bukan urutan array mentah
      // di data template).
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
        // statis SAMA ORIGIN (public/quick-setup-products/*.jpg, lihat
        // catatan lengkap di QuickSetupTemplateProduct.coverImagePath),
        // di-fetch sebagai blob lalu diunggah ulang lewat endpoint cover
        // yang sudah ada (backend butuh multipart file, bukan URL
        // eksternal). Soft-fail -- produk yang SUDAH dibuat di atas tetap
        // berhasil walau foto sampulnya gagal terpasang.
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
        // Aktivasi payment_link -- perbaikan 19 Agustus 2026: sebelumnya
        // produk payment_link (satu-satunya template food-beverage) aktif
        // OTOMATIS begitu dibuat, tidak butuh file. Sejak sampul jadi wajib
        // untuk SEMUA jenis produk (product.go, permintaan langsung
        // pengguna "sampul jangan dijadikan opsional"), Create tidak lagi
        // mengaktifkan payment_link otomatis -- tanpa baris ini, produk
        // contoh food-beverage akan diam-diam jadi draft (regresi dari
        // perilaku sebelumnya), padahal sampulnya SUDAH ada di sini.
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
      // Agustus 2026: "karena page link bio dan toko terpisah saya mau
      // buatkan juga template quick setup untuk page toko nya". Toko punya
      // theme/layout_variant sendiri (page_type='produk', paritas penuh
      // dengan builder Bio lewat ProdukPageEditor, lihat CLAUDE.md) --
      // begitu template diterapkan ke Bio, Toko AUTO kreator ini (kalau
      // sudah ada, lihat pickAutoTokoPage) ikut disamakan temanya supaya
      // kedua halaman tetap satu identitas visual walau sekarang route-nya
      // terpisah. Lookup diulang di sini (bukan pakai tokoBefore) supaya
      // Toko yang BARU SAJA otomatis terbuat (ensureProdukPage, dipicu
      // produk pertama loop di atas) juga tercakup, bukan cuma yang sudah
      // ada sebelum template ini diterapkan.
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

      setApplied(t);
      setSelected(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menerapkan template, coba lagi.");
    } finally {
      setApplying(false);
    }
  }

  if (applied) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
          <IconCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold text-ink">Template &quot;{applied.label}&quot; diterapkan</h1>
        <p className="mt-2 text-sm text-muted">
          Tema, bio (kalau sebelumnya kosong), dan {applied.links.length} tautan starter sudah ditambahkan. Buka Link Bio untuk
          melengkapi link asli kamu ke tiap platform.
        </p>
        {applied.products && applied.products.length > 0 && (
          <p className="mt-2 text-sm text-muted">
            {applied.products.length} produk contoh (draft) juga sudah dibuat di menu Toko -- belum aktif/bisa dibeli sampai kamu
            unggah file & sesuaikan nama/harganya.
          </p>
        )}
        {tokoSynced && (
          <p className="mt-2 text-sm text-muted">Tema Halaman Toko-mu juga sudah ikut disesuaikan mengikuti template ini.</p>
        )}
        {applied.monetizationHint && (
          <p className="mt-3 rounded-xl bg-primary-subtle px-4 py-3 text-xs font-semibold text-primary">{applied.monetizationHint}</p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard/links")}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-card hover:-translate-y-0.5"
          >
            Buka Link Bio
          </button>
          <button type="button" onClick={() => setApplied(null)} className="text-sm font-semibold text-muted hover:text-ink">
            Pilih template lain
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="mt-1 text-sm text-muted">
        Pilih template sesuai jenis halamanmu -- tema, saran bio, dan tautan starter langsung diterapkan sekaligus. Tinggal lengkapi
        link asli kamu setelahnya.
      </p>

      <div className="relative mt-5">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari template (mis. streamer, toko, guru)..."
          className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-ink focus:border-primary focus:outline-none"
        />
      </div>

      <div className="scroll-row -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
            category === "all" ? "bg-primary text-white" : "bg-primary-subtle text-primary hover:bg-primary/15"
          }`}
        >
          Semua
        </button>
        {QUICK_SETUP_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`flex-shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              category === c.key ? "bg-primary text-white" : "bg-primary-subtle text-primary hover:bg-primary/15"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((t, i) => {
          // Pemutus baris eksplisit -- susulan permintaan pengguna: sort
          // by (category, layoutVariant) di atas TIDAK CUKUP sendirian
          // untuk menjamin "satu baris = satu bentuk mockup" di grid
          // responsif ini (2/3/4 kolom) -- kalau jumlah anggota satu
          // grup layoutVariant bukan kelipatan jumlah kolom yang sedang
          // aktif (mis. 5 template "hero" di grid 4 kolom), sisa anggota
          // grup itu meluber ke baris berikutnya & bercampur dengan grup
          // layoutVariant lain yang mulai di baris yang sama. col-span-full
          // di sini memaksa kartu PERTAMA tiap grup baru SELALU mulai
          // dari kolom pertama (baris baru) apa pun lebar layar/jumlah
          // kolom aktif saat ini -- baris terakhir satu grup boleh tidak
          // penuh (mis. cuma 1-3 kartu), tapi tidak akan pernah campur
          // bentuk dengan grup lain lagi.
          const prev = filtered[i - 1];
          const startsNewGroup =
            i > 0 && prev !== undefined && (prev.category !== t.category || (prev.layoutVariant ?? "centered") !== (t.layoutVariant ?? "centered"));
          return (
            <Fragment key={t.key}>
              {startsNewGroup && <div className="col-span-full h-0 w-0" aria-hidden="true" />}
              {/* div role="button" -- BUKAN <button> sungguhan: PagePreview di
                  dalamnya merender ShareButton (elemen <button> sendiri), dan
                  <button> di dalam <button> itu HTML TIDAK VALID (ditemukan
                  lewat error hydration React sungguhan saat verifikasi) --
                  browser otomatis "meratakan" nesting itu, event klik jadi
                  kacau. tabIndex+onKeyDown menjaga tetap bisa diakses keyboard. */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelected(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(t);
                  }
                }}
                className="flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-white text-left shadow-card transition-transform hover:-translate-y-0.5"
              >
            {/* Mockup mini -- permintaan langsung pengguna: "yang
                ditampilkan itu... langsung terlihat bentuknya... tanpa
                harus diklik dulu" -- SEBELUMNYA cuma pil warna berisi teks
                (mendekati tapi masih bukan bentuk asli), sekarang komponen
                PagePreview SUNGGUHAN (sama persis dipakai modal & Pratinjau
                Langsung dashboard) dirender LANGSUNG di kartu, bukan
                representasi buatan tangan -- kreator lihat bentuk PERSIS
                halaman publik SEBELUM klik apa pun, pola zoom+crop sama
                seperti LivePreviewPanel (cuma lebih kecil & tanpa scroll,
                overflow-hidden supaya jadi cuplikan bagian atas saja).
                pointer-events-none -- mockup MURNI visual, semua klik di
                area ini harus jatuh ke div pembungkus (buka modal), bukan
                ke tombol ShareButton/tautan sungguhan di dalam PagePreview. */}
            {/* Permintaan langsung pengguna: "dibuat card lebih tinggi"
                supaya bentuknya lebih mirip pratinjau sungguhan (bukan
                cuma cuplikan sempit) -- tinggi & zoom dinaikkan supaya
                lebih banyak konten (avatar+bio+beberapa tautan) terlihat
                proporsional, pola sama seperti kotak pratinjau modal/
                LivePreviewPanel, cuma disesuaikan untuk kartu galeri. */}
                <div className="relative h-80 w-full overflow-hidden bg-white pointer-events-none" aria-hidden="true">
                  <div className="h-full [zoom:0.42]">
                    <PagePreview interactive={false} rootClassName="min-h-full" data={buildPreviewData(t, myPage?.username ?? "namamu", myPage?.display_name || "Nama Kamu", myPage?.avatar_url ?? "")} />
                  </div>
                </div>
                <div className="p-3.5">
                  <p className="font-heading text-sm font-bold text-ink">{t.label}</p>
                  <p className="mt-1 text-xs text-muted">{t.description}</p>
                </div>
              </div>
            </Fragment>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
            Tidak ada template yang cocok dengan pencarianmu.
          </p>
        )}
      </div>

      {selected && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={() => !applying && setSelected(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-hero sm:grid sm:grid-cols-[260px_1fr] sm:gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mockup visual -- komponen PagePreview yang SAMA dipakai
                Pratinjau Langsung di seluruh dashboard (LivePreviewPanel),
                dibangun langsung dari data template (belum tersimpan).
                Pola zoom+kotak tetap sama persis dengan LivePreviewPanel
                supaya proporsinya konsisten di seluruh dashboard. */}
            <div className="mx-auto h-[520px] w-full max-w-[260px] flex-shrink-0 overflow-y-auto rounded-2xl border border-border shadow-card [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="h-full [zoom:0.65]">
                <PagePreview interactive={false} rootClassName="min-h-full" data={previewData} />
              </div>
            </div>

            <div className="mt-4 sm:mt-0">
              <p className="font-heading text-lg font-bold text-ink">{selected.label}</p>
              <p className="mt-1 text-sm text-muted">{selected.description}</p>

              <div className="mt-4 flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Tema</p>
                  <p className="mt-0.5 text-ink">{PAGE_THEMES[selected.theme as keyof typeof PAGE_THEMES]?.label ?? selected.theme}</p>
                  {tokoPage && (
                    <p className="mt-0.5 text-[11px] text-muted">Tema Halaman Toko-mu juga akan ikut disesuaikan.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Layout</p>
                  <p className="mt-0.5 text-ink">{LAYOUT_VARIANT_LABELS[selected.layoutVariant ?? "centered"]}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Saran Bio</p>
                  <p className="mt-0.5 text-ink">{selected.bio}</p>
                  <p className="mt-0.5 text-[11px] text-muted">Hanya dipakai kalau bio kamu masih kosong.</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Tautan Starter ({selected.links.length})</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Menggantikan SEMUA tautan/blok yang sudah ada saat ini di Link Bio -- bukan ditambahkan di atasnya.
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {selected.links.map((l) => (
                      <li key={l.title} className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
                        {l.title}
                      </li>
                    ))}
                  </ul>
                </div>
                {selected.blocks && selected.blocks.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Blok Konten</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {selected.blocks.map((b) => (
                        <li key={b.title} className="rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary">
                          {b.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {selected.products && selected.products.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted">Produk Siap Pakai</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {selected.products.map((p) => (
                        <li key={p.name} className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-dark">
                          {p.name}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[11px] text-muted">
                      Dibuat sebagai draft di menu Toko -- belum aktif/bisa dibeli sampai kamu unggah file & sesuaikan harga.
                    </p>
                  </div>
                )}
                {selected.monetizationHint && (
                  <p className="rounded-xl bg-accent/10 px-3 py-2 text-xs font-semibold text-accent-dark">{selected.monetizationHint}</p>
                )}
              </div>

              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyTemplate(selected)}
                  disabled={applying}
                  className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                >
                  {applying ? "Menerapkan..." : "Terapkan Template"}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  disabled={applying}
                  className="rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink disabled:opacity-60"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
