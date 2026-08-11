"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, MyPage, createBlock, createLink, deleteLink, getMyPage, listLinks, updateMyPage } from "@/lib/api-client";
import { confirmDelete } from "@/lib/confirm";
import { PAGE_THEMES } from "@/lib/page-themes";
import { QUICK_SETUP_CATEGORIES, QUICK_SETUP_TEMPLATES, QuickSetupTemplate } from "@/lib/quick-setup-templates";
import { IconCheck, IconSearch } from "@/components/icons";
import PagePreview, { PagePreviewData } from "@/components/PagePreview";

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
  // username/avatar akun sendiri (bukan placeholder generik), tidak dipakai
  // untuk apa pun selain itu di halaman ini (pengecekan bio-kosong saat
  // menerapkan tetap fetch ulang di applyTemplate supaya datanya terbaru).
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
    return {
      username: myPage?.username ?? "namamu",
      bio: selected.bio,
      avatarUrl: myPage?.avatar_url ?? "",
      theme: selected.theme,
      links: [
        ...selected.links.map((l) => ({ id: l.title, title: l.title, url: l.url, blockType: "link" as const })),
        ...(selected.blocks ?? []).map((b) => ({
          id: b.title,
          title: b.title,
          url: "",
          blockType: b.type,
          blockData: b.type === "text" ? { text: b.text } : {},
        })),
      ],
      products: [],
    };
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
      const page = await getMyPage();
      await updateMyPage(page.bio.trim() ? { theme: t.theme } : { theme: t.theme, bio: t.bio });

      // Sequential (bukan Promise.all) -- posisi tautan dihitung server-side
      // dari MAX(position)+1 tiap insert, permintaan paralel berisiko dua
      // tautan kebetulan dapat posisi yang sama.
      for (const l of t.links) {
        await createLink(l);
      }
      for (const b of t.blocks ?? []) {
        await createBlock({
          block_type: b.type,
          title: b.title,
          block_data: b.type === "text" ? { text: b.text } : {},
        });
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
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {filtered.map((t) => {
          const themePreset = PAGE_THEMES[t.theme as keyof typeof PAGE_THEMES];
          const isDark = themePreset?.previewIsDark;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setSelected(t)}
              className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white text-left shadow-card transition-transform hover:-translate-y-0.5"
            >
              {/* Mockup mini -- permintaan langsung pengguna: "yang
                  ditampilkan itu bentuk nya asli atau langsung terlihat
                  bukan sekedar begitu saja" (bar warna polos sebelumnya
                  tidak cukup mewakili), lalu susulan "mockup nya harus ada
                  isi datanya juga dummy gapapa" -- bar/pil ABSTRAK tanpa
                  teks (revisi pertama) masih belum cukup, sekarang label
                  tautan (dari t.links, data template sungguhan, cuma
                  belum tautan asli kreator makanya "dummy") ditampilkan
                  sebagai teks sungguhan di tiap pil, plus nama contoh di
                  bawah avatar. Pola warna PERSIS sama dengan ThemeTile di
                  galeri Tema (previewBg/previewIsDark/buyButton) supaya
                  tetap satu bahasa visual dengan galeri tema yang sudah
                  ada. */}
              <div className="relative aspect-[3/4] w-full overflow-hidden" style={{ background: themePreset?.previewBg }} aria-hidden="true">
                <span
                  className={`absolute left-1/2 top-3 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold ${
                    isDark ? "bg-white/25 text-white" : "bg-ink/10 text-ink"
                  }`}
                >
                  N
                </span>
                <p className={`absolute inset-x-2 top-[3rem] truncate text-center text-[9px] font-bold ${isDark ? "text-white/80" : "text-ink/70"}`}>
                  Nama Kamu
                </p>
                <div className="absolute inset-x-2.5 bottom-2.5 flex flex-col gap-1.5">
                  {t.links.slice(0, 3).map((l) => (
                    <span
                      key={l.title}
                      className={`truncate rounded-full px-2 py-1 text-center text-[9px] font-semibold leading-none ring-1 ring-black/10 ${themePreset?.buyButton ?? "bg-primary text-white"}`}
                    >
                      {l.title}
                    </span>
                  ))}
                </div>
              </div>
              <div className="p-3.5">
                <p className="font-heading text-sm font-bold text-ink">{t.label}</p>
                <p className="mt-1 text-xs text-muted">{t.description}</p>
              </div>
            </button>
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
