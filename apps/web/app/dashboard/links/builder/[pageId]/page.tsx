"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ApiError,
  DashboardProduct,
  EmbeddedBuilderBlock,
  ExtraPageDetail,
  LinkItem,
  MyPage,
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
  updateLink,
  updateMyPage,
} from "@/lib/api-client";
import { BuilderColumn, BuilderRoot, BuilderSeg, getChildrenAt, newBuilderBlock, setChildrenAt, updateAt } from "@/lib/builder-blocks";
import { useLocale } from "@/lib/locale-context";
import { IconChevronRight } from "@/components/icons";
import BuilderLeftPanel, { BuilderSelection } from "@/components/BuilderLeftPanel";
import BuilderCanvas from "@/components/BuilderCanvas";

// Canvas Page Builder (migrasi 000096, permintaan langsung pengguna 7
// September 2026, dua screenshot Lynk.id) -- route BARU, layar penuh
// (masih di dalam shell dashboard yang sudah ada -- lihat catatan
// lengkap di commit ini soal cakupan Fase 1 dipersempit dari referensi
// Lynk.id yang benar-benar tanpa sidebar sama sekali, mengubah
// dashboard/layout.tsx di luar cakupan Fase 1). pageId "main" = halaman
// utama (bio), selain itu = id halaman tambahan -- konvensi BARU khusus
// route ini (dashboard/links/page.tsx SEBELUMNYA tidak punya URL param
// per-halaman sama sekali, murni state client lewat pill-switcher).
//
// Blok ROOT (Section/Column/Text/Button/Divider) tetap baris `links`
// biasa -- reorder/create/delete lewat endpoint links yang SUDAH ADA
// (reorderLinks/createBlock/deleteLink, sama seperti editor daftar
// sederhana). Konten DI DALAM Section/Column dibaca/ditulis lewat
// lib/builder-blocks.ts (path-based) + SATU PATCH block_data ke baris
// root itu sendiri (updateLink) -- generalisasi persis pola
// onCommitCatalogRoot yang sudah ada utk blok "catalog".
export default function BuilderPage() {
  const { t } = useLocale();
  const router = useRouter();
  const params = useParams<{ pageId: string }>();
  const pageId = params.pageId;
  const isMain = pageId === "main";

  const [page, setPage] = useState<MyPage | null>(null);
  // extraPageType -- MyPage (halaman utama) TIDAK punya field page_type sama
  // sekali (SELALU "bio" secara implisit) -- dilacak terpisah dari `page`,
  // pola SAMA PERSIS `activePage.pageType` di dashboard/links/page.tsx,
  // bukan field di objek `page` yang di-shim dari ExtraPageDetail.
  const [extraPageType, setExtraPageType] = useState<"bio" | "landing" | undefined>(undefined);
  const [extraPageSlug, setExtraPageSlug] = useState<string | undefined>(undefined);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // fetchPageData -- PURE (return data, TANPA setState) -- lihat pola resmi
  // di CLAUDE.md (react-hooks/set-state-in-effect): dipisah dari
  // applyPageData supaya efek di bawah bisa merangkai `.then(applyPageData)`
  // langsung pada promise yang direturn, bukan menyembunyikan setState di
  // dalam fungsi yang dipanggil efek.
  const fetchPageData = useCallback(async () => {
    if (isMain) {
      const [p, l, prod] = await Promise.all([getMyPage(), listLinks(), listProducts()]);
      return { page: p, extraPageType: undefined as "bio" | "landing" | undefined, extraPageSlug: undefined as string | undefined, links: l, products: prod };
    }
    const [detail, l, prod] = await Promise.all([getExtraPage(pageId), listExtraPageLinks(pageId), listProducts()]);
    const shimmed: MyPage = {
      ...(detail as ExtraPageDetail),
      username: "",
      verification: { email_verified: false, profile_complete: false, has_paid_order: false, is_verified: false },
    };
    return {
      page: shimmed,
      extraPageType: (detail.page_type === "produk" ? undefined : detail.page_type) as "bio" | "landing" | undefined,
      extraPageSlug: detail.slug as string | undefined,
      links: l,
      products: prod,
    };
  }, [isMain, pageId]);

  const applyPageData = useCallback((result: Awaited<ReturnType<typeof fetchPageData>>) => {
    setPage(result.page);
    setExtraPageType(result.extraPageType);
    setExtraPageSlug(result.extraPageSlug);
    setLinks(result.links);
    setProducts(result.products);
  }, []);

  useEffect(() => {
    fetchPageData()
      .then(applyPageData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.loadFailed")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya perlu jalan sekali per pageId, `t` tidak boleh memicu reload berulang.
  }, [pageId]);

  // Pastikan builder_mode='builder' begitu route ini dibuka -- entry point
  // di dashboard/links/page.tsx sudah PATCH duluan sebelum navigasi ke
  // sini, tapi route ini SENGAJA tidak bergantung pada itu (mis. pengguna
  // buka URL ini langsung/refresh) -- idempoten, aman dipanggil ulang.
  useEffect(() => {
    if (!page || page.builder_mode === "builder") return;
    const patch = { builder_mode: "builder" as const };
    (isMain ? updateMyPage(patch) : updateExtraPage(pageId, patch)).catch(() => {
      // Soft-fail -- kanvas tetap bisa dipakai, cuma halaman publik belum
      // ikut pindah render sampai patch ini berhasil (autosave berikutnya
      // yang menyentuh page settings biasanya ikut mengoreksi).
    });
  }, [page, isMain, pageId]);

  function currentCreateBlock(input: Parameters<typeof createBlock>[0]) {
    return isMain ? createBlock(input) : createExtraPageBlock(pageId, input);
  }
  function currentReorderLinks(items: { id: string; position: number }[]) {
    return isMain ? reorderLinks(items) : reorderExtraPageLinks(pageId, items);
  }

  async function refresh() {
    const fresh = isMain ? await listLinks() : await listExtraPageLinks(pageId);
    setLinks(fresh);
  }

  function findRoot(rootId: string): LinkItem | undefined {
    return links.find((l) => l.id === rootId);
  }

  function rootToBuilderRoot(root: LinkItem): BuilderRoot {
    return {
      children: root.block_data?.children as EmbeddedBuilderBlock[] | undefined,
      columns: root.block_data?.columns as BuilderColumn[] | undefined,
    };
  }

  async function handleAdd(target: BuilderSelection | null, type: EmbeddedBuilderBlock["block_type"]) {
    setError(null);
    try {
      if (!target) {
        const title = t(`dashboard.components.builderAddComponentModal.${TYPE_LABEL_KEY[type] ?? "typeText"}`);
        await currentCreateBlock({
          block_type: type,
          title,
          block_data: newBuilderBlock(type).block_data,
          // "https://" saja gagal validasi http_url backend (tidak ada host)
          // -- root "button" WAJIB url non-kosong (beda dari anak tertanam
          // di Section/Column, lihat catatan lengkap di links.go), jadi
          // placeholder ini SENGAJA sebuah URL valid, diedit belakangan
          // lewat panel kiri.
          url: type === "button" ? "https://example.com" : undefined,
        });
      } else {
        const root = findRoot(target.rootId);
        if (!root) return;
        const builderRoot = rootToBuilderRoot(root);
        const existing = getChildrenAt(builderRoot, target.path);
        const updated = setChildrenAt(builderRoot, target.path, [...existing, newBuilderBlock(type)]);
        await updateLink(root.id, { block_data: { ...root.block_data, ...updated } });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
    }
  }

  async function handleDelete(target: BuilderSelection) {
    setError(null);
    try {
      if (target.path.length === 0) {
        await deleteLink(target.rootId);
      } else {
        const root = findRoot(target.rootId);
        if (!root) return;
        const builderRoot = rootToBuilderRoot(root);
        const parentPath = target.path.slice(0, -1);
        const lastSeg = target.path[target.path.length - 1];
        if (lastSeg.kind !== "child") return; // segmen "column" tidak bisa dihapus langsung -- lihat catatan BuilderLeftPanel.
        const siblings = getChildrenAt(builderRoot, parentPath);
        const updated = setChildrenAt(
          builderRoot,
          parentPath,
          siblings.filter((c) => c.id !== lastSeg.id)
        );
        await updateLink(root.id, { block_data: { ...root.block_data, ...updated } });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
    }
  }

  // handleReorderRoot -- dipanggil BuilderLeftPanel setelah drag-and-drop
  // (@dnd-kit) SELESAI di level root, `orderedIds` sudah urutan baru
  // lengkap (bukan cuma pasangan naik/turun) -- lihat arrayMove di
  // BuilderLeftPanel.tsx.
  async function handleReorderRoot(orderedIds: string[]) {
    const byId = new Map(links.map((l) => [l.id, l] as const));
    const reordered = orderedIds.map((id) => byId.get(id)).filter((l): l is LinkItem => !!l);
    setLinks(reordered);
    try {
      await currentReorderLinks(reordered.map((l, i) => ({ id: l.id, position: i })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
      await refresh();
    }
  }

  // handleReorderChildren -- reorder DI DALAM SATU Section/kolom (bukan
  // root) -- SATU PATCH block_data ke baris root itu sendiri, pola sama
  // persis handleUpdateNode/handleAdd/handleDelete di bawah.
  async function handleReorderChildren(rootId: string, containerPath: BuilderSeg[], orderedIds: string[]) {
    setError(null);
    try {
      const root = findRoot(rootId);
      if (!root) return;
      const builderRoot = rootToBuilderRoot(root);
      const existing = getChildrenAt(builderRoot, containerPath);
      const byId = new Map(existing.map((c) => [c.id, c] as const));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((c): c is EmbeddedBuilderBlock => !!c);
      const updated = setChildrenAt(builderRoot, containerPath, reordered);
      await updateLink(root.id, { block_data: { ...root.block_data, ...updated } });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
    }
  }

  async function handleUpdateNode(target: BuilderSelection, patch: { title?: string; url?: string; description?: string; blockData?: Record<string, unknown> }) {
    setError(null);
    try {
      if (target.path.length === 0) {
        await updateLink(target.rootId, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.url !== undefined ? { url: patch.url } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.blockData !== undefined ? { block_data: patch.blockData } : {}),
        });
      } else {
        const root = findRoot(target.rootId);
        if (!root) return;
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
        await updateLink(root.id, { block_data: { ...root.block_data, ...updated } });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.linksBuilder.errors.saveFailed"));
    }
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-app-muted">{t("dashboard.pages.linksBuilder.loading")}</div>;
  }

  if (!page) {
    return <div className="flex h-screen items-center justify-center text-sm text-app-muted">{t("dashboard.pages.linksBuilder.errors.loadFailed")}</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-app-bg">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-app-border bg-app-surface px-4 py-3">
        <button type="button" onClick={() => router.push("/dashboard/links")} className="flex items-center gap-1 text-xs font-bold text-app-muted hover:text-app-ink">
          <IconChevronRight className="h-4 w-4 rotate-180" />
          {t("dashboard.pages.linksBuilder.back")}
        </button>
        <p className="flex-1 truncate text-center text-sm font-bold text-app-ink">{t("dashboard.pages.linksBuilder.title")}</p>
        <div className="w-16" />
      </div>
      {error && <p className="flex-shrink-0 bg-red-50 px-4 py-2 text-center text-xs text-red-600">{error}</p>}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[320px_1fr]">
        <BuilderLeftPanel
          links={links}
          onAdd={handleAdd}
          onDelete={handleDelete}
          onReorderRoot={handleReorderRoot}
          onReorderChildren={handleReorderChildren}
          onUpdateNode={handleUpdateNode}
          designHref="/dashboard/design"
          settingsHref="/dashboard/settings"
        />
        <BuilderCanvas page={page} links={links} products={products} pageType={extraPageType} pageSlug={extraPageSlug} />
      </div>
    </div>
  );
}

const TYPE_LABEL_KEY: Record<string, string> = {
  text: "typeText",
  button: "typeButton",
  divider: "typeDivider",
  column: "typeColumn",
  section: "typeSection",
  video: "typeVideo",
  faq: "typeFaq",
  gallery: "typeImageGrid",
  image: "typeImage",
  video_image: "typeVideoImage",
  embed_link: "typeEmbedLink",
};
