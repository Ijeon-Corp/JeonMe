"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, MyPage, createBlock, createLink, deleteLink, getMyPage, listLinks, updateMyPage } from "@/lib/api-client";
import { confirmDelete } from "@/lib/confirm";
import { PAGE_THEMES } from "@/lib/page-themes";
import { QUICK_SETUP_CATEGORIES, QUICK_SETUP_TEMPLATES, QuickSetupTemplate, orderedTemplateItems } from "@/lib/quick-setup-templates";
import { IconCheck, IconSearch } from "@/components/icons";
import PagePreview, { PagePreviewData } from "@/components/PagePreview";

// LAYOUT_VARIANT_LABELS -- label deskriptif per varian untuk modal
// pratinjau (lihat renderBioHeader, PagePreview.tsx, untuk detail visual
// tiap varian).
const LAYOUT_VARIANT_LABELS: Record<"centered" | "banner" | "card" | "spotlight" | "cover" | "minimal", string> = {
  centered: "Centered (di tengah)",
  banner: "Banner (rata kiri sebaris)",
  card: "Card (dibungkus kartu, avatar menonjol)",
  spotlight: "Spotlight (avatar besar + badge nama)",
  cover: "Cover (pita sampul, avatar menindih tepi bawah)",
  minimal: "Minimal (avatar kecil sebaris nama)",
};

// buildPreviewData -- SATU fungsi dipakai baik untuk mockup kecil di tiap
// kartu galeri MAUPUN modal pratinjau, supaya keduanya selalu identik
// (bukan dua implementasi terpisah yang bisa tidak sinkron). blockData per
// blockType dipetakan dari OrderedTemplateItem (lib/quick-setup-templates.ts)
// -- SATU sumber kebenaran urutan & isi, sama dengan yang dipakai
// applyTemplate untuk benar-benar membuatnya.
function buildPreviewData(t: QuickSetupTemplate, username: string, displayName: string, avatarUrl: string): PagePreviewData {
  return {
    username,
    // displayName -- permintaan langsung pengguna: "yang tampil di mockup
    // itu bukan username tapi display name" -- renderBioHeader
    // (PagePreview.tsx) merender `displayName || username`, jadi SEBELUM
    // ini nama akun (mis. "namamu") ikut tampil apa adanya di mockup kalau
    // kreator belum mengisi nama tampilan. displayName di sini SELALU
    // truthy (myPage?.display_name atau placeholder "Nama Kamu" dari
    // pemanggil) supaya username mentah tidak pernah lagi jadi yang
    // tampil di judul nama mockup.
    displayName,
    bio: t.bio,
    avatarUrl,
    theme: t.theme,
    layoutVariant: t.layoutVariant ?? "centered",
    links: orderedTemplateItems(t).map((item) => ({
      id: item.title,
      title: item.title,
      url: item.url,
      blockType: item.blockType,
      blockData:
        item.blockType === "maps"
          ? { embed: false }
          : item.blockType === "text"
          ? { text: item.text }
          : item.blockType === "faq"
          ? { items: item.faqItems }
          : {},
    })),
    products: [],
  };
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

  useEffect(() => {
    getMyPage()
      .then(setMyPage)
      .catch(() => {});
  }, []);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return QUICK_SETUP_TEMPLATES.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
    });
  }, [category, query]);

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
      if (existing.length > 0) {
        const ok = await confirmDelete(
          `Menerapkan template "${t.label}" akan menghapus ${existing.length} tautan/blok yang sudah ada saat ini, lalu menggantinya dengan tautan starter template ini.`,
          { title: "Ganti semua tautan?", confirmButtonText: "Ya, Ganti" }
        );
        if (!ok) return;
      }

      setApplying(true);

      for (const l of existing) {
        await deleteLink(l.id);
      }

      // Bio kreator yang SUDAH diisi tidak boleh ditimpa diam-diam --
      // saran bio template cuma dipakai kalau bio masih kosong.
      // layout_variant SELALU ikut diterapkan (bukan cuma kalau bio
      // kosong) -- ini bagian dari "bentuk" template, sama seperti tema.
      const page = await getMyPage();
      const layoutVariant = t.layoutVariant ?? "centered";
      await updateMyPage(
        page.bio.trim() ? { theme: t.theme, layout_variant: layoutVariant } : { theme: t.theme, bio: t.bio, layout_variant: layoutVariant }
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
          await createLink({ title: item.title, url: item.url });
        } else if (item.blockType === "maps") {
          await createBlock({ block_type: "maps", title: item.title, url: item.url, block_data: { embed: false } });
        } else if (item.blockType === "faq") {
          await createBlock({ block_type: "faq", title: item.title, block_data: { items: item.faqItems } });
        } else {
          await createBlock({
            block_type: item.blockType,
            title: item.title,
            block_data: item.blockType === "text" ? { text: item.text } : {},
          });
        }
      }

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
        {filtered.map((t) => (
          // div role="button" -- BUKAN <button> sungguhan: PagePreview di
          // dalamnya merender ShareButton (elemen <button> sendiri), dan
          // <button> di dalam <button> itu HTML TIDAK VALID (ditemukan
          // lewat error hydration React sungguhan saat verifikasi) --
          // browser otomatis "meratakan" nesting itu, event klik jadi
          // kacau. tabIndex+onKeyDown menjaga tetap bisa diakses keyboard.
          <div
            key={t.key}
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
        ))}
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
