"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  DashboardProduct,
  LinkItem,
  MyPage,
  PageStickerData,
  getMyPage,
  listLinks,
  listProducts,
  updateMyPage,
  updateMyPageStickers,
} from "@/lib/api-client";

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
    | "hide_watermark"
    // layout_variant -- permintaan langsung pengguna, 13 Agustus 2026
    // ("tambahkan model baru hero dan featured link... buat saja yang
    // penting semua kebutuhan terpenuhi"): pemilih layout manual baru di
    // /dashboard/design/header butuh field ini di PageSettingsPatch --
    // SEBELUMNYA layout_variant cuma pernah diisi lewat Quick Setup
    // (jalur kode berbeda, langsung updateMyPage), tidak pernah lewat
    // hook ini.
    | "layout_variant"
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
    // Bentuk UPDATER + rollback per-field -- perbaikan 24 September 2026
    // (audit kualitas kode). Sebelumnya `setPage({ ...page, ... })` dan
    // rollback `setPage(previous)` memakai snapshot `page` dari closure
    // SEBELUM await: perubahan lain yang terjadi selama request berjalan
    // (mis. kreator mengetik nama/bio sambil menunggu) ikut tertimpa
    // balik, dan satu PATCH yang gagal membatalkan TAMPILAN perubahan lain
    // yang justru berhasil tersimpan. Rollback kini hanya mengembalikan
    // field milik patch ini, di atas state TERKINI.
    const previous = page;
    setPage((prev) => (prev ? { ...prev, ...patch } : prev));
    try {
      await updateMyPage(patch);
    } catch (err) {
      const revert = Object.fromEntries(
        (Object.keys(patch) as (keyof MyPage)[]).map((k) => [k, previous[k]])
      ) as Partial<MyPage>;
      setPage((prev) => (prev ? { ...prev, ...revert } : prev));
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

  // handleStickersChange -- Modul Desain: array diganti UTUH lewat endpoint
  // terpisah (bukan salah satu field PageSettingsPatch), sama alasan dengan
  // catatan di updateMyPageStickers.
  async function handleStickersChange(stickers: PageStickerData[]) {
    if (!page) return;
    // Updater + rollback per-field, lihat catatan di handlePageSettingChange.
    const previousStickers = page.stickers;
    setPage((prev) => (prev ? { ...prev, stickers } : prev));
    try {
      await updateMyPageStickers(stickers);
    } catch (err) {
      setPage((prev) => (prev ? { ...prev, stickers: previousStickers } : prev));
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan stiker.");
    }
  }

  return {
    page,
    setPage,
    links,
    products,
    loading,
    error,
    setError,
    handlePageSettingChange,
    handleStyleOverride,
    handleStickersChange,
  };
}
