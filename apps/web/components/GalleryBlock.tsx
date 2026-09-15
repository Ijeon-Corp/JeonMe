"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { IconChevronRight, IconClose } from "@/components/icons";

// Blok "gallery" (hasil analisa galeri tema kompetitor, 17 Agustus 2026 --
// template portofolio/wisata s.id memakai grid multi-foto yang belum ada
// padanannya di Jeonme, blok "image" lama cuma 1 foto per blok).
//
// Lightbox -- susulan 14 September 2026 (audit benchmark Linktree: "Image
// Gallery" resminya membuka pop-up saat foto diketuk, swipe di mobile/
// panah di desktop -- gap paling mencolok dibanding grid statis Jeonme
// sebelumnya). File ini jadi Client Component (dulu Server Component murni,
// lihat komentar lama di git blame) HANYA utk state buka/tutup+index
// lightbox -- grid thumbnail-nya sendiri tetap decorative/tanpa efek
// samping. Navigasi keyboard (Escape/ArrowLeft/ArrowRight) + swipe touch
// (threshold sederhana, tanpa dependency carousel baru, pola sama seperti
// ImageSliderBlock.tsx yang juga menghindari dependency baru).
export default function GalleryBlock({
  title,
  images,
  cardClassName,
  titleClassName,
  icon,
}: {
  title: string;
  images: string[];
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length)), [images.length]);
  const next = useCallback(() => setOpenIndex((i) => (i === null ? null : (i + 1) % images.length)), [images.length]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, close, prev, next]);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
    // Threshold 40px -- cukup besar utk hindari salah pencet saat pengunjung
    // sekadar menggeser scroll halaman vertikal dgn sedikit horizontal drift.
    if (Math.abs(dx) > 40) {
      if (dx > 0) prev();
      else next();
    }
  }

  return (
    <div className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg"
              aria-label={`Perbesar foto ${i + 1}`}
            >
              {/* `fill` -- tombol pembungkusnya `aspect-square w-full`, jadi
                  tingginya turun dari rasio & lebarnya dari kolom grid (tidak
                  ada angka lebar literal). Butuh `relative` di tombol itu,
                  ditambahkan di baris class-nya. Sel grid 3 kolom di dalam
                  kolom publik max-w-md -> ~130px, dibulatkan ke atas ke 150px
                  untuk layar retina. */}
              <Image
                src={src}
                alt={title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`}
                fill
                sizes="150px"
                className="object-cover transition-transform duration-200 hover:scale-105"
              />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-red-500">Galeri belum berisi foto.</p>
      )}

      {/* createPortal ke document.body -- ditemukan lewat verifikasi live
          (bukan cuma baca kode): kartu blok di tema APAPUN yang pakai efek
          hover "naik" (hover:-translate-y-0.5, dipakai luas di seluruh
          sistem tema) membuat ancestor punya `transform` aktif saat kartu
          di-hover (yang PASTI terjadi -- klik selalu didahului hover) --
          `position: fixed` di dalam ancestor ber-transform apa pun berhenti
          relatif ke viewport, malah relatif ke ancestor itu (perilaku
          standar CSS, bukan bug browser), bikin lightbox terkurung di
          dalam kartu alih-alih menutupi layar penuh. Portal ke document.body
          menghindarinya sepenuhnya, bukan sekadar menambal satu tema.
          `document` DIJAMIN ada di sini walau komponen ini di-SSR (dynamic()
          default ssr:true) -- cabang ini HANYA pernah true setelah
          setOpenIndex dipanggil dari click handler, yang cuma bisa terjadi
          pasca-hidrasi di klien, jadi tidak perlu flag "mounted" terpisah. */}
      {openIndex !== null && createPortal(
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-4"
          onClick={close}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          role="dialog"
          aria-modal="true"
          aria-label={title || "Galeri foto"}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Tutup"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <IconClose className="h-5 w-5" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Sebelumnya"
                className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-4"
              >
                <IconChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Berikutnya"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-4"
              >
                <IconChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* SENGAJA TETAP <img> mentah (audit performa 15 September 2026,
              migrasi next/image): foto lightbox tampil pada UKURAN ASLINYA yang
              dibatasi `max-h-full max-w-full` -- jadi kotaknya dihitung runtime
              dari dimensi foto itu sendiri, persis model yang TIDAK bisa
              diwakili width/height tetap milik next/image (rasio tebakan apa pun
              akan salah untuk foto potret maupun panorama). `fill` juga bukan
              jawabannya: tombol prev/next di overlay yang sama diposisikan
              absolut relatif ke pembungkus ini. Lagi pula di sinilah foto justru
              memang ingin dilihat pada resolusi penuh, jadi keuntungan srcset-nya
              paling kecil di seluruh komponen ini. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[openIndex]}
            alt={title ? `${title} ${openIndex + 1}` : `Foto galeri ${openIndex + 1}`}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
              {openIndex + 1} / {images.length}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
