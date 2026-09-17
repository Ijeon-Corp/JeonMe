"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { IconChevronRight, IconClose } from "@/components/icons";
import { Share2 } from "lucide-react";

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
//
// Tampilan "stack" + captions -- permintaan langsung pengguna, 18 September
// 2026 (dua screenshot referensi): "blok menampilkan image ketika image di
// klik muncul lagi pop up berisi image dan keterangan nya". display="stack"
// merender SATU kartu tumpukan foto (3 foto teratas dikipas miring) +
// judul + "Galeri · N foto"; ketukan membuka LEMBAR popup (portal) berisi
// setiap foto lebar penuh beserta judul & keterangannya (captions, dikunci
// per URL foto -- lihat validateBlockDataAtDepth links.go), tombol bagikan
// (Web Share API, fallback salin tautan) & tutup mengambang di kanan bawah
// -- persis tata letak referensi. Mode "grid" (bawaan, blok lama) tidak
// berubah; caption (kalau ada) ikut tampil di bawah foto lightbox-nya.
export interface GalleryCaption {
  title?: string;
  description?: string;
}

export default function GalleryBlock({
  title,
  images,
  cardClassName,
  titleClassName,
  icon,
  display = "grid",
  captions = {},
}: {
  title: string;
  images: string[];
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
  display?: "grid" | "stack";
  captions?: Record<string, GalleryCaption>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
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

  // Lembar "stack": Escape menutup, scroll body dikunci selama terbuka
  // (lembar punya scroll sendiri, jangan sampai halaman di belakangnya
  // ikut bergeser saat pengunjung menggulir daftar foto).
  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sheetOpen]);

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

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: title || "Galeri", url });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      }
    } catch {
      // Pengunjung membatalkan share sheet native -- bukan error.
    }
  }

  const captionFor = (src: string): GalleryCaption => captions[src] ?? {};

  if (display === "stack" && images.length > 0) {
    // Tiga foto teratas dikipas: yang paling atas (index 0) tegak & penuh,
    // dua di belakangnya miring kiri/kanan sedikit -- meniru referensi.
    const fan = images.slice(0, 3);
    const tilt = ["rotate-0 z-30", "-rotate-6 z-20 scale-95", "rotate-6 z-10 scale-95"];
    return (
      <div className={cardClassName}>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Buka galeri ${title || ""}`.trim()}
          className="group flex w-full flex-col items-center gap-3 text-left"
        >
          <div className="relative aspect-[4/3] w-full max-w-[420px]">
            {fan.map((src, i) => (
              <div
                key={src}
                className={`absolute inset-x-[6%] inset-y-[8%] overflow-hidden rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] ring-1 ring-black/10 transition-transform duration-300 group-hover:scale-[1.02] ${tilt[i]}`}
              >
                <Image src={src} alt={captionFor(src).title || (title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`)} fill sizes="420px" className="object-cover" />
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col items-center">
            <p className={`flex items-center gap-1.5 text-lg font-bold leading-tight ${titleClassName}`}>
              {icon}
              <span>{title}</span>
            </p>
            <p className="mt-1 text-sm opacity-70">Galeri · {images.length} foto</p>
          </div>
        </button>

        {sheetOpen &&
          createPortal(
            <div className="fixed inset-0 z-[999] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6" onClick={() => setSheetOpen(false)} role="dialog" aria-modal="true" aria-label={title || "Galeri foto"}>
              <div
                className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white text-[#111111] shadow-2xl sm:rounded-3xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex-shrink-0 border-b border-black/5 px-6 py-4 text-center">
                  <h2 className="truncate text-base font-semibold">{title}</h2>
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6">
                  <div className="flex flex-col gap-8">
                    {images.map((src, i) => {
                      const cap = captionFor(src);
                      return (
                        <figure key={src} className="flex flex-col gap-3">
                          {/* next/image (bukan <img> mentah seperti lightbox grid di
                              bawah): foto di lembar ini selalu selebar kolom lembar
                              (max-w-lg = 512px), jadi srcset optimizer justru pas;
                              width/height 1200x900 cuma petunjuk rasio awal --
                              tinggi sebenarnya `auto` mengikuti foto. Sekaligus
                              lewat /_next/image (same-origin), tidak bergantung
                              host storage diizinkan img-src CSP seperti <img>
                              langsung. */}
                          <Image
                            src={src}
                            alt={cap.title || (title ? `${title} ${i + 1}` : `Foto ${i + 1}`)}
                            width={1200}
                            height={900}
                            sizes="(max-width: 640px) 100vw, 512px"
                            priority={i === 0}
                            className="h-auto w-full rounded-2xl object-cover"
                          />
                          {(cap.title || cap.description) && (
                            <figcaption>
                              {cap.title && <p className="text-xl font-bold leading-tight">{cap.title}</p>}
                              {cap.description && <p className="mt-1 whitespace-pre-line text-base text-black/55">{cap.description}</p>}
                            </figcaption>
                          )}
                        </figure>
                      );
                    })}
                  </div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-3 p-5">
                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label="Bagikan"
                    title={shareState === "copied" ? "Tautan disalin" : "Bagikan"}
                    className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-1 ring-black/10 hover:bg-neutral-100"
                  >
                    {shareState === "copied" ? <span className="text-[10px] font-bold">OK</span> : <Share2 className="h-5 w-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    aria-label="Tutup"
                    className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-[#111111] shadow-[0_6px_20px_rgba(0,0,0,0.25)] ring-1 ring-black/10 hover:bg-neutral-100"
                  >
                    <IconClose className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    );
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
                alt={captionFor(src).title || (title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`)}
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
          <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[openIndex]}
              alt={captionFor(images[openIndex]).title || (title ? `${title} ${openIndex + 1}` : `Foto galeri ${openIndex + 1}`)}
              className="max-h-[80vh] max-w-full object-contain"
            />
            {(captionFor(images[openIndex]).title || captionFor(images[openIndex]).description) && (
              <div className="max-w-md text-center text-white">
                {captionFor(images[openIndex]).title && <p className="text-sm font-bold">{captionFor(images[openIndex]).title}</p>}
                {captionFor(images[openIndex]).description && <p className="mt-0.5 whitespace-pre-line text-xs text-white/70">{captionFor(images[openIndex]).description}</p>}
              </div>
            )}
          </div>

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
