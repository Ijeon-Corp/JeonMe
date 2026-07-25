"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  ExtraPage,
  LinkItem,
  THEME_PRESETS,
  createExtraPage,
  createExtraPageBlock,
  createExtraPageLink,
  deleteExtraPage,
  deleteLink,
  listExtraPageLinks,
  listMyExtraPages,
  updateExtraPage,
} from "@/lib/api-client";
import { IconChevronRight, IconGlobe, IconInbox, IconPlus, IconTrash } from "@/components/icons";
import Toggle from "@/components/Toggle";

type LandingBlockType = "heading" | "text" | "image" | "button";

const LANDING_BLOCK_LABEL: Record<LandingBlockType, string> = {
  heading: "Judul Besar",
  text: "Paragraf Teks",
  image: "Gambar",
  button: "Tombol CTA",
};

// No.98 (Sprint 14): halaman bio TAMBAHAN -- punya bio/tema/tautan sendiri,
// tapi berbagi katalog produk & monetisasi (voucher/event/booking/dst) yang
// SAMA dengan halaman utama (lihat catatan lingkup lengkap di backend
// PageHandler). Halaman utama TETAP dikelola lewat menu Tautan/Desain
// seperti biasa -- halaman ini KHUSUS untuk halaman kedua/ketiga/dst.
//
// No.99 (Sprint 14): kalau page_type="landing", "Kelola" menampilkan
// builder BLOK (heading/text/gambar/tombol) alih-alih formulir tautan biasa
// -- TANPA tombol "Create with AI" (keputusan eksplisit pengguna), murni
// blok manual siap pakai.
export default function DashboardExtraPagesPage() {
  const [pages, setPages] = useState<ExtraPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [pageType, setPageType] = useState<"bio" | "landing">("bio");

  const [managingId, setManagingId] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  const [blockType, setBlockType] = useState<LandingBlockType>("heading");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockText, setBlockText] = useState("");
  const [blockImageUrl, setBlockImageUrl] = useState("");
  const [blockButtonUrl, setBlockButtonUrl] = useState("");
  const [addingBlock, setAddingBlock] = useState(false);

  function reload() {
    return listMyExtraPages().then(setPages);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat halaman."))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    if (!name.trim() || !cleanSlug) {
      setError("Nama dan slug halaman wajib diisi.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createExtraPage({ name: name.trim(), slug: cleanSlug, page_type: pageType });
      await reload();
      setName("");
      setSlug("");
      setPageType("bio");
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat halaman.");
    } finally {
      setCreating(false);
    }
  }

  async function handleTogglePublish(page: ExtraPage) {
    const next = !page.is_published;
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, is_published: next } : p)));
    try {
      await updateExtraPage(page.id, { is_published: next });
    } catch (err) {
      setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, is_published: page.is_published } : p)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui halaman.");
    }
  }

  async function handleDelete(page: ExtraPage) {
    if (!window.confirm(`Hapus halaman "${page.name}"? Semua kontennya ikut terhapus.`)) return;
    const previous = pages;
    setPages((prev) => prev.filter((p) => p.id !== page.id));
    try {
      await deleteExtraPage(page.id);
      if (managingId === page.id) setManagingId(null);
    } catch (err) {
      setPages(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus halaman.");
    }
  }

  async function handleOpenManage(page: ExtraPage) {
    setError(null);
    setManagingId(page.id);
    try {
      setLinks(await listExtraPageLinks(page.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat konten halaman.");
      setManagingId(null);
    }
  }

  async function handleFieldChange(page: ExtraPage, field: "bio" | "theme", value: string) {
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, [field]: value } : p)));
    try {
      await updateExtraPage(page.id, { [field]: value });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan perubahan.");
    }
  }

  async function handleDeleteLink(linkId: string) {
    if (!managingId) return;
    const previous = links;
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    try {
      await deleteLink(linkId);
    } catch (err) {
      setLinks(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus konten.");
    }
  }

  async function handleAddLink() {
    if (!managingId || !linkTitle.trim() || !linkUrl.trim()) {
      setError("Isi judul dan URL tautan.");
      return;
    }
    setError(null);
    setAddingLink(true);
    try {
      await createExtraPageLink(managingId, { title: linkTitle.trim(), url: linkUrl.trim() });
      setLinks(await listExtraPageLinks(managingId));
      setLinkTitle("");
      setLinkUrl("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah tautan.");
    } finally {
      setAddingLink(false);
    }
  }

  function resetBlockForm() {
    setBlockTitle("");
    setBlockText("");
    setBlockImageUrl("");
    setBlockButtonUrl("");
  }

  async function handleAddBlock() {
    if (!managingId) return;
    if (!blockTitle.trim()) {
      setError("Isi judul internal blok (tidak tampil untuk heading/text).");
      return;
    }
    if ((blockType === "heading" || blockType === "text") && !blockText.trim()) {
      setError("Isi teksnya.");
      return;
    }
    if (blockType === "image" && !blockImageUrl.trim()) {
      setError("Isi URL gambar.");
      return;
    }
    if (blockType === "button" && !blockButtonUrl.trim()) {
      setError("Isi URL tujuan tombol.");
      return;
    }

    setError(null);
    setAddingBlock(true);
    try {
      await createExtraPageBlock(managingId, {
        block_type: blockType,
        title: blockTitle.trim(),
        url: blockType === "button" ? blockButtonUrl.trim() : undefined,
        block_data:
          blockType === "image"
            ? { image_url: blockImageUrl.trim() }
            : blockType === "heading" || blockType === "text"
              ? { text: blockText.trim() }
              : {},
      });
      setLinks(await listExtraPageLinks(managingId));
      resetBlockForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah blok.");
    } finally {
      setAddingBlock(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Halaman Tambahan</h1>
      <p className="mt-1 text-sm text-muted">
        Kelola beberapa halaman terpisah dari satu akun di jeonme.com/p/{"{slug}"}: halaman{" "}
        <b>Bio</b> (bio/tema/tautan sendiri, produk & monetisasi tetap sama seperti halaman utamamu) atau halaman{" "}
        <b>Landing</b> (blok penuh-lebar untuk satu kampanye/tujuan tertentu -- heading, teks, gambar, tombol CTA).
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            Buat Halaman Baru
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Jenis Halaman</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPageType("bio")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    pageType === "bio" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
                  }`}
                >
                  Halaman Bio
                </button>
                <button
                  type="button"
                  onClick={() => setPageType("landing")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                    pageType === "landing" ? "border-primary bg-primary-subtle text-primary" : "border-border text-muted"
                  }`}
                >
                  Halaman Landing
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Nama Halaman (internal)</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={pageType === "landing" ? "Promo Lebaran 2026" : "Toko Skincare"}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Slug URL (jeonme.com/p/...)</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="toko-skincare"
                pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-1 text-[11px] text-muted">Huruf kecil, angka, dan tanda hubung saja.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Halaman"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {pages.map((page) => (
          <div key={page.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-bold text-ink">{page.name}</p>
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-muted">
                    {page.page_type === "landing" ? "Landing" : "Bio"}
                  </span>
                </div>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <IconGlobe className="h-3 w-3" />
                  jeonme.com/p/{page.slug}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(page)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={page.is_published} onChange={() => handleTogglePublish(page)} label={`Publikasikan ${page.name}`} />
                <span className="text-xs font-semibold text-muted">Publikasikan</span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenManage(page)}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary-subtle"
              >
                Kelola
                <IconChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {managingId === page.id && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-primary-subtle/20 p-3">
                {page.page_type === "bio" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Bio</label>
                      <textarea
                        value={page.bio}
                        onChange={(e) => handleFieldChange(page, "bio", e.target.value)}
                        rows={2}
                        maxLength={160}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Tema</label>
                      <select
                        value={page.theme}
                        onChange={(e) => handleFieldChange(page, "theme", e.target.value)}
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      >
                        {THEME_PRESETS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-ink">
                    {page.page_type === "landing" ? "Blok Halaman" : "Tautan"}
                  </p>

                  {page.page_type === "bio" ? (
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        placeholder="Judul tautan"
                        value={linkTitle}
                        onChange={(e) => setLinkTitle(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      />
                      <input
                        type="url"
                        placeholder="https://..."
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddLink}
                        disabled={addingLink}
                        className="btn-primary rounded-lg px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {addingLink ? "Menambah..." : "Tambah"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-2.5">
                      <select
                        value={blockType}
                        onChange={(e) => setBlockType(e.target.value as LandingBlockType)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                      >
                        {(Object.keys(LANDING_BLOCK_LABEL) as LandingBlockType[]).map((bt) => (
                          <option key={bt} value={bt}>
                            {LANDING_BLOCK_LABEL[bt]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder={blockType === "button" ? "Label tombol (mis. Beli Sekarang)" : "Judul internal blok"}
                        value={blockTitle}
                        onChange={(e) => setBlockTitle(e.target.value)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                      />
                      {(blockType === "heading" || blockType === "text") && (
                        <textarea
                          placeholder="Isi teks"
                          value={blockText}
                          onChange={(e) => setBlockText(e.target.value)}
                          rows={blockType === "heading" ? 1 : 3}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      )}
                      {blockType === "image" && (
                        <input
                          type="url"
                          placeholder="URL gambar (https://...)"
                          value={blockImageUrl}
                          onChange={(e) => setBlockImageUrl(e.target.value)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      )}
                      {blockType === "button" && (
                        <input
                          type="url"
                          placeholder="URL tujuan tombol (https://...)"
                          value={blockButtonUrl}
                          onChange={(e) => setBlockButtonUrl(e.target.value)}
                          className="rounded-lg border border-border px-2.5 py-1.5 text-xs focus:border-primary focus:outline-none"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleAddBlock}
                        disabled={addingBlock}
                        className="btn-primary rounded-lg py-1.5 text-xs font-bold text-white disabled:opacity-60"
                      >
                        {addingBlock ? "Menambah..." : "Tambah Blok"}
                      </button>
                    </div>
                  )}

                  <div className="mt-2 flex flex-col gap-1.5">
                    {links.map((link) => (
                      <div key={link.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">
                            {link.block_type && link.block_type !== "link" && (
                              <span className="mr-1.5 rounded bg-ink/5 px-1.5 py-0.5 text-[9px] uppercase text-muted">
                                {link.block_type}
                              </span>
                            )}
                            {link.title || (link.block_data?.text as string) || "(tanpa judul)"}
                          </p>
                          <p className="truncate text-muted">
                            {link.block_type === "image"
                              ? (link.block_data?.image_url as string)
                              : link.block_type === "heading" || link.block_type === "text"
                                ? (link.block_data?.text as string)
                                : link.url}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(link.id)}
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-red-600 hover:bg-red-50"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {links.length === 0 && (
                      <p className="mt-1 text-xs text-muted">
                        {page.page_type === "landing" ? "Belum ada blok -- tambahkan di atas." : "Belum ada tautan -- tambahkan di atas."}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setManagingId(null)}
                  className="rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        ))}

        {pages.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-white/60 px-4 py-4 text-sm text-muted">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            Belum ada halaman tambahan -- klik &quot;Buat Halaman Baru&quot; di atas.
          </div>
        )}
      </div>
    </div>
  );
}
