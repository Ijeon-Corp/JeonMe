"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconClose, IconSearch } from "@/components/icons";
import { SEARCH_INDEX } from "@/lib/search-index";

// Permintaan langsung pengguna: "saya mau tambahkan search global jadi
// bisa mencari semua fitur yang ada di menu menu berdasarkan keyword" --
// command palette ala referensi top bar "Ctrl + K" (tangkapan layar admin
// template pengguna sebelumnya). Trigger di top bar (lihat layout.tsx) +
// pintasan keyboard Ctrl/Cmd+K dari halaman mana pun di dashboard. Data
// sumber SEARCH_INDEX (lib/search-index.ts) -- filter murni client-side
// atas label/deskripsi/keywords, tidak ada endpoint API baru (semua tujuan
// pencarian sudah statis, tidak perlu query server).
export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEARCH_INDEX;
    return SEARCH_INDEX.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  }, [query]);

  function goTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  // openPalette -- reset query/activeIndex terjadi LANGSUNG di sini (tempat
  // `open` diset true), bukan lewat useEffect terpisah yang bereaksi ke
  // `open` -- setState sinkron langsung di badan effect memicu
  // react-hooks/set-state-in-effect (cascading render tidak perlu untuk
  // reset yang sebenarnya bisa terjadi bersamaan dengan aksi yang memicunya).
  function openPalette() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Fokus input -- sinkronisasi ke sistem eksternal (DOM), BUKAN setState,
  // jadi aman sebagai efek (beda dari reset query/activeIndex di atas).
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [open]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) goTo(target.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        title="Cari menu (Ctrl+K)"
        aria-label="Cari menu"
        className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-semibold text-muted hover:border-primary hover:text-primary"
      >
        <IconSearch className="h-3.5 w-3.5" />
        {/* Bug ditemukan (5 Agustus 2026, audit responsif): "sm:inline"
            (>=640px) membuat label ini sudah tampil penuh di lebar tablet
            (768px) tepat saat topbar desktop (md:flex, >=768px) juga mulai
            tampil bersama ikon lain + pil username -- gabungannya melebihi
            lebar layar. Ditunda ke "lg:inline" (>=1024px) supaya tetap
            ikon-saja selama rentang tablet, sama seperti perilaku di bawah
            640px sebelumnya. */}
        <span className="hidden lg:inline">Cari menu</span>
        <span className="hidden rounded border border-border px-1 text-[10px] text-muted/70 lg:inline">Ctrl K</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-3">
              <IconSearch className="h-4 w-4 flex-shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Cari fitur, mis. voucher, KYC, tema..."
                className="w-full bg-transparent text-sm outline-none"
              />
              <button type="button" onClick={() => setOpen(false)} className="flex-shrink-0 text-muted hover:text-ink">
                <IconClose className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted">Tidak ada fitur yang cocok dengan &quot;{query}&quot;.</p>
              ) : (
                results.map((item, i) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => goTo(item.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                      i === activeIndex ? "bg-primary-subtle/60" : "hover:bg-primary-subtle/40"
                    }`}
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{item.label}</span>
                      <span className="block truncate text-xs text-muted">{item.description}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
