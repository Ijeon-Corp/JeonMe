"use client";

import { useState } from "react";
import type { PageTheme } from "@/lib/page-themes";

// ProdukCategoryFilter -- chip kategori di atas blok "produk" pada halaman
// publik (permintaan langsung pengguna, 18 September 2026: "tambah
// filtering by kategori jika menggunakan blok produk", dikonfirmasi via
// AskUserQuestion: untuk pengunjung DAN untuk kreator di editor -- yang
// editor lihat ProdukBlockEditor.tsx). Mengembalikan kemampuan tab
// kategori yang hilang saat grid produk otomatis dihapus (15 September
// 2026). Dipakai bersama renderLinkOrBlock (PagePreview.tsx, mode Simple)
// & renderBuilderNode (BuilderPagePreviewInternal.tsx, Canvas Builder) --
// keduanya fungsi render murni tanpa state, jadi state chip aktif hidup di
// komponen kecil ini lewat render-prop `children(visible)`.
//
// Chip HANYA tampil kalau `enabled` (block_data.show_category_filter) DAN
// produk terpilih punya >= 2 kategori berbeda -- satu kategori saja tidak
// ada yang bisa disaring, lebih baik tidak menampilkan UI kosong. Label
// "Semua" hardcoded Bahasa Indonesia, konvensi komponen publik lain
// (BuyProductButton/LockedLinkButton tidak memakai useLocale).
export default function ProdukCategoryFilter<T extends { category?: string }>({
  products,
  enabled,
  theme,
  children,
}: {
  products: T[];
  enabled: boolean;
  theme: PageTheme;
  children: (visible: T[]) => React.ReactNode;
}) {
  const [active, setActive] = useState("");
  const categories = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => !!c))).sort();
  if (!enabled || categories.length < 2) return <>{children(products)}</>;

  // Kategori aktif bisa hilang dari daftar (kreator mengubah pilihan produk
  // saat pratinjau langsung di dashboard) -- jatuh ke "Semua", bukan grid
  // kosong.
  const effective = categories.includes(active) ? active : "";
  const visible = effective ? products.filter((p) => p.category === effective) : products;

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter kategori produk">
        {["", ...categories].map((c) => {
          const isActive = c === effective;
          return (
            <button
              key={c || "__all"}
              type="button"
              onClick={() => setActive(c)}
              aria-pressed={isActive}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors ${isActive ? theme.buyButton : `${theme.card} ${theme.cardTitle}`}`}
            >
              {c || "Semua"}
            </button>
          );
        })}
      </div>
      {children(visible)}
    </div>
  );
}
