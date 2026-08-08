"use client";

import { useEffect, useState } from "react";
import { ApiError, DashboardProduct, LinkItem, MyPage, getMyPage, listLinks, listProducts, updateMyPage } from "@/lib/api-client";

// useDesignData -- permintaan langsung pengguna: setiap menu di halaman
// Desain (Tema/Header/Tombol/Font) sekarang jadi HALAMAN TERSENDIRI
// (sebelumnya accordion di satu halaman) supaya bisa dibuka lewat URL
// langsung & navigasi terasa seperti pengaturan sungguhan, bukan cuma
// expand/collapse. Logika muat-data & simpan-pengaturan yang sebelumnya
// cuma ada SEKALI di satu komponen sekarang dipakai bersama oleh 5 halaman
// (index + theme/header/tombol/font) lewat hook ini supaya tidak
// terduplikasi 5 kali.
export type PageSettingsPatch = Partial<
  Pick<
    MyPage,
    | "theme"
    | "display_name"
    | "bio"
    | "is_published"
    | "seo_title"
    | "seo_description"
    | "noindex"
    | "custom_background_type"
    | "custom_background_value"
    | "custom_font"
    | "custom_button_color"
    | "custom_button_style"
    | "custom_button_rounded"
    | "custom_button_shadow"
    | "custom_button_text_color"
    | "custom_page_text_color"
    | "custom_title_font"
    | "custom_title_color"
    | "custom_style_override"
    | "sticker"
  >
>;

export function useDesignData() {
  const [page, setPage] = useState<MyPage | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [products, setProducts] = useState<DashboardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMyPage(), listLinks(), listProducts()])
      .then(([p, l, prod]) => {
        setPage(p);
        setLinks(l);
        setProducts(prod);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat data."))
      .finally(() => setLoading(false));
  }, []);

  async function handlePageSettingChange(patch: PageSettingsPatch) {
    if (!page) return;
    const previous = page;
    setPage({ ...page, ...patch });
    try {
      await updateMyPage(patch);
    } catch (err) {
      setPage(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan pengaturan halaman.");
    }
  }

  // handleStyleOverride -- dipakai KHUSUS oleh halaman Tombol/Font. Bug
  // dilaporkan pengguna (migrasi 000035): menyentuh tombol/font sebelumnya
  // memaksa ganti `theme` jadi "custom" -- membuang latar/mood preset yang
  // sudah dipilih. Sekarang HANYA menyalakan flag custom_style_override
  // (lapisan independen di atas tema apa pun, lihat getPageTheme di
  // page-themes.ts), `theme` TIDAK disentuh sama sekali.
  function handleStyleOverride(patch: Omit<PageSettingsPatch, "theme" | "custom_style_override">) {
    return handlePageSettingChange({ ...patch, custom_style_override: true });
  }

  return { page, setPage, links, products, loading, error, setError, handlePageSettingChange, handleStyleOverride };
}
