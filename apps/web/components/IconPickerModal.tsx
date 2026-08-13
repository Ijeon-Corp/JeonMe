"use client";

import { useMemo, useState } from "react";
import { ICON_LIBRARY, LibraryIcon } from "@/lib/icon-library";
import { IconClose, IconSearch } from "@/components/icons";

// IconPickerModal -- permintaan langsung pengguna, 13 Agustus 2026: "saya
// mau tambahkan untuk memilih icon untuk blok yang sudah disediakan dari
// web ini... supaya user tidak perlu mendownload icon sendiri dan
// mengupload ke web ini". Pola modal SAMA PERSIS dengan modal "Tambah"
// (AddModal) di halaman ini -- search bar + grid, supaya terasa konsisten
// dengan UI yang sudah ada, bukan komponen baru dengan gaya sendiri.
// Dikelompokkan per kategori (lihat lib/icon-library.ts) supaya 200+ ikon
// tetap gampang dijelajahi tanpa scroll tak berujung -- pencarian
// melewati pengelompokan (hasil filter tampil rata, lintas kategori).
export default function IconPickerModal({
  currentKey,
  onSelect,
  onClose,
}: {
  currentKey?: string;
  onSelect: (icon: LibraryIcon) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchLower = search.trim().toLowerCase();

  const grouped = useMemo(() => {
    const filtered = searchLower
      ? ICON_LIBRARY.filter((i) => i.label.toLowerCase().includes(searchLower) || i.key.includes(searchLower))
      : ICON_LIBRARY;
    const map = new Map<string, LibraryIcon[]>();
    for (const icon of filtered) {
      const list = map.get(icon.category) ?? [];
      list.push(icon);
      map.set(icon.category, list);
    }
    return map;
  }, [searchLower]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8 sm:items-center" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-heading text-lg font-bold text-ink">Pilih Ikon</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-shrink-0 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
            <IconSearch className="h-4 w-4 flex-shrink-0 text-muted" />
            <input
              type="text"
              autoFocus
              placeholder="Cari ikon (mis. kopi, musik, toko)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {grouped.size === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Ikon tidak ditemukan, coba kata kunci lain.</p>
          ) : (
            Array.from(grouped.entries()).map(([category, icons]) => (
              <div key={category} className="mb-5 last:mb-0">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{category}</p>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-7">
                  {icons.map((icon) => (
                    <button
                      key={icon.key}
                      type="button"
                      title={icon.label}
                      onClick={() => onSelect(icon)}
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                        currentKey === icon.key
                          ? "border-primary bg-primary-subtle text-primary"
                          : "border-border text-ink hover:border-primary/50 hover:bg-primary-subtle/40"
                      }`}
                    >
                      <icon.Icon className="h-5 w-5" />
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
