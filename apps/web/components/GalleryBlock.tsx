"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { IconChevronRight, IconClose } from "@/components/icons";
import { Images, Share2 } from "lucide-react";
import type { GalleryDisplay } from "@/lib/gallery-display";
import { overlayClass, sheetPanelClass, usePresence, zoomPanelClass } from "@/lib/use-presence";

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

// nestedViewer -- lapisan viewer FOTO ANAK di atas foto utama yang sedang
// terbuka (lihat catatan panjang "Foto di dalam foto" di bawah).
interface NestedViewerState {
  parentSrc: string;
  index: number;
}

export default function GalleryBlock({
  title,
  images,
  cardClassName,
  titleClassName,
  icon,
  display = "grid",
  captions = {},
  nestedImages = {},
}: {
  title: string;
  images: string[];
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
  icon?: React.ReactNode;
  // display -- "grid"/"stack" (lihat catatan di atas) + 4 tampilan baru 18
  // September 2026 ("tambahkan beberapa bentuk display lagi untuk image
  // grid"): "carousel" (geser horizontal, satu foto besar per slide),
  // "collage" (kelompok 3 foto: 1 besar + 2 kecil, sisi besar berselang-
  // seling), "masonry" (2 kolom mengikuti rasio asli tiap foto), "circles"
  // (deretan foto bundar ala sorotan Instagram + judul foto di bawahnya).
  // Semua selain "stack" berbagi lightbox yang sama (openIndex).
  display?: GalleryDisplay;
  captions?: Record<string, GalleryCaption>;
  // nestedImages -- "foto di dalam foto" (permintaan langsung pengguna, 21
  // September 2026: "ketika salah 1 ketiga image itu di klik maka akan
  // muncul beberapa gambar lagi seperti ada image di dalam image"). PETA
  // keyed by URL foto UTAMA (sama pola dengan `captions`) -> daftar URL foto
  // ANAK-nya. Foto utama yang punya anak dapat lencana kecil (ikon tumpuk +
  // jumlah) di mana pun ia tampil (lembar "stack"/"kipas" ATAU lightbox
  // biasa) -- ketuk foto itu menyingkap galeri mini anaknya, ketuk salah
  // satu anaknya membuka nestedViewer (lapisan layar penuh TERPISAH,
  // z-index lebih tinggi dari lightbox/lembar induk) dgn navigasi prev/next
  // sendiri di dalam set anak itu.
  nestedImages?: Record<string, string[]>;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  // expandedNestedFor -- URL foto utama yang strip thumbnail anaknya sedang
  // disingkap (di lembar ATAU di lightbox, sama variabel karena cuma satu
  // yang mungkin terbuka pada satu waktu). nestedViewer -- foto ANAK mana
  // yang sedang dibuka penuh layar, di atas expandedNestedFor.
  const [expandedNestedFor, setExpandedNestedFor] = useState<string | null>(null);
  const [nestedViewer, setNestedViewer] = useState<NestedViewerState | null>(null);
  const touchStartX = useRef<number | null>(null);

  // Animasi buka/tutup (permintaan langsung pengguna, 25 September 2026:
  // "blok blok yang akan memunculkan pop up perbaiki tampilan nya dan
  // berikan animasi saat terbuka dan tertutup"). usePresence menahan
  // overlay tetap ter-mount selama animasi tutup; shownIndex/shownNested
  // menyimpan foto TERAKHIR yang tampil supaya isi overlay tidak kosong
  // di tengah animasi tutup (saat openIndex/nestedViewer sudah null).
  const lightbox = usePresence(openIndex !== null);
  const sheet = usePresence(sheetOpen);
  const nestedPresence = usePresence(nestedViewer !== null);
  const [shownIndex, setShownIndex] = useState<number | null>(openIndex);
  if (openIndex !== null && openIndex !== shownIndex) setShownIndex(openIndex);
  const [shownNested, setShownNested] = useState<NestedViewerState | null>(nestedViewer);
  if (nestedViewer !== null && nestedViewer !== shownNested) setShownNested(nestedViewer);

  const nestedFor = useCallback((src: string): string[] => nestedImages[src] ?? [], [nestedImages]);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(() => setOpenIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length)), [images.length]);
  const next = useCallback(() => setOpenIndex((i) => (i === null ? null : (i + 1) % images.length)), [images.length]);

  const closeNested = useCallback(() => setNestedViewer(null), []);
  const prevNested = useCallback(() => {
    setNestedViewer((v) => {
      if (!v) return v;
      const arr = nestedImages[v.parentSrc] ?? [];
      if (arr.length === 0) return null;
      return { ...v, index: (v.index - 1 + arr.length) % arr.length };
    });
  }, [nestedImages]);
  const nextNested = useCallback(() => {
    setNestedViewer((v) => {
      if (!v) return v;
      const arr = nestedImages[v.parentSrc] ?? [];
      if (arr.length === 0) return null;
      return { ...v, index: (v.index + 1) % arr.length };
    });
  }, [nestedImages]);

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (nestedViewer) closeNested();
        else close();
      } else if (e.key === "ArrowLeft") {
        if (nestedViewer) prevNested();
        else prev();
      } else if (e.key === "ArrowRight") {
        if (nestedViewer) nextNested();
        else next();
      }
    }
    // Kunci scroll halaman di belakang lightbox (sebelumnya cuma lembar
    // "stack" yang mengunci) -- tanpa ini swipe vertikal di ponsel ikut
    // menggulir halaman di balik foto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openIndex, close, prev, next, nestedViewer, closeNested, prevNested, nextNested]);

  // Lembar "stack": Escape menutup, scroll body dikunci selama terbuka
  // (lembar punya scroll sendiri, jangan sampai halaman di belakangnya
  // ikut bergeser saat pengunjung menggulir daftar foto).
  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (nestedViewer) closeNested();
        else setSheetOpen(false);
      } else if (nestedViewer && e.key === "ArrowLeft") prevNested();
      else if (nestedViewer && e.key === "ArrowRight") nextNested();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sheetOpen, nestedViewer, closeNested, prevNested, nextNested]);

  // Reset lapisan anak setiap kali lembar/lightbox ditutup atau foto utama
  // yang aktif berganti -- cegah nestedViewer "bocor" nyangkut terbuka dgn
  // parentSrc yang sudah tidak relevan. Pola "adjust state during render"
  // (react-hooks/set-state-in-effect melarang setState sinkron di dalam
  // useEffect, lihat CLAUDE.md) -- bandingkan ke nilai sebelumnya yang
  // dilacak state, setState kondisional LANGSUNG di badan komponen.
  const [prevSheetOpen, setPrevSheetOpen] = useState(sheetOpen);
  if (sheetOpen !== prevSheetOpen) {
    setPrevSheetOpen(sheetOpen);
    if (!sheetOpen) {
      setExpandedNestedFor(null);
      setNestedViewer(null);
    }
  }
  const [prevOpenIndex, setPrevOpenIndex] = useState(openIndex);
  if (openIndex !== prevOpenIndex) {
    setPrevOpenIndex(openIndex);
    setExpandedNestedFor(null);
    setNestedViewer(null);
  }

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

  // renderNestedStrip -- baris thumbnail foto ANAK milik `parentSrc`,
  // disingkap saat foto utamanya diketuk (lihat expandedNestedFor). Dipakai
  // di DUA tempat: lembar "stack"/"kipas" (variant "sheet", latar terang)
  // & lightbox biasa (variant "lightbox", latar gelap) -- makanya warna ring
  // & bar-nya diparameterkan lewat variant, bukan dua salinan kode terpisah.
  function renderNestedStrip(parentSrc: string, variant: "sheet" | "lightbox") {
    if (expandedNestedFor !== parentSrc) return null;
    const nested = nestedFor(parentSrc);
    if (nested.length === 0) return null;
    return (
      <div
        className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {nested.map((nestedSrc, i) => (
          <button
            key={nestedSrc}
            type="button"
            onClick={() => setNestedViewer({ parentSrc, index: i })}
            aria-label={`Buka foto terkait ${i + 1}`}
            className={`relative h-16 w-16 flex-shrink-0 cursor-zoom-in overflow-hidden rounded-lg ring-1 ${
              variant === "sheet" ? "ring-black/10" : "ring-white/20"
            }`}
          >
            <Image src={nestedSrc} alt="" fill sizes="64px" className="object-cover" />
          </button>
        ))}
      </div>
    );
  }

  // renderNestedViewer -- layar penuh utk SATU foto anak, z-index LEBIH
  // TINGGI dari lembar (z-[999]) & lightbox biasa (z-[999]) supaya selalu di
  // atas apa pun yang membukanya. Dipakai di lembar "stack"/"kipas" MAUPUN
  // lightbox grid/carousel/dll -- satu fungsi, dipanggil di kedua tempat,
  // karena `nestedViewer` cuma satu variabel & bentuknya identik di mana pun
  // dibuka. stopPropagation di backdrop-nya WAJIB: createPortal tetap
  // membubble event lewat pohon React (bukan pohon DOM), jadi tanpa itu klik
  // di sini akan ikut menutup lembar/lightbox induk yang memanggilnya.
  function renderNestedViewer() {
    if (!nestedPresence.mounted || !shownNested) return null;
    const arr = nestedImages[shownNested.parentSrc] ?? [];
    const src = arr[shownNested.index];
    if (!src) return null;
    return createPortal(
      <div
        className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm ${overlayClass(nestedPresence.visible)}`}
        onClick={(e) => {
          e.stopPropagation();
          closeNested();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Foto terkait"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            closeNested();
          }}
          aria-label="Kembali"
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25"
        >
          <IconClose className="h-5 w-5" />
        </button>

        {arr.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevNested();
              }}
              aria-label="Foto terkait sebelumnya"
              className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 sm:left-4"
            >
              <IconChevronRight className="h-5 w-5 rotate-180" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextNested();
              }}
              aria-label="Foto terkait berikutnya"
              className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 sm:right-4"
            >
              <IconChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* min-h -- bug UI/UX ditemukan 21 September 2026 (audit menyeluruh):
            foto yang lebih kecil dari viewport SEBELUMNYA dirender pada
            ukuran piksel ASLINYA (cuma dibatasi max-height/max-width, tidak
            pernah diperbesar) -- tampil mini di tengah layar hitam kosong.
            min-h memaksa kotak tampil minimal segini, object-contain lalu
            memperbesar foto mengisinya (letterbox di sisi pendek, TIDAK
            crop) -- sengaja cuma min-height (bukan min-width juga) supaya
            tidak berisiko overflow horizontal di layar sempit. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Foto terkait ${shownNested.index + 1}`}
          className={`max-h-[80vh] min-h-[40vh] max-w-full object-contain ${zoomPanelClass(nestedPresence.visible)}`}
          onClick={(e) => e.stopPropagation()}
        />

        {arr.length > 1 && (
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums text-white ring-1 ring-white/20 backdrop-blur-md">
            {shownNested.index + 1} / {arr.length}
          </div>
        )}
      </div>,
      document.body
    );
  }

  if ((display === "stack" || display === "fan") && images.length > 0) {
    // Tiga foto teratas dikipas: yang paling atas (index 0) tegak & penuh,
    // dua di belakangnya miring kiri/kanan sedikit -- meniru referensi.
    // "fan" (19 September 2026, screenshot referensi kedua dari pengguna):
    // foto LANSKAP; dua foto belakang mengintip di tepi kiri & kanan
    // (bukan bertumpuk rapat di belakang foto depan), sedikit lebih tinggi
    // dari foto depan; judul besar + subjudul berikon di bawah. Popup
    // (lembar) yang dibuka SAMA dengan "stack".
    const isFan = display === "fan";
    const fan = images.slice(0, 3);
    const tilt = isFan
      ? // Foto depan diperlebar (dulu 70% lebar/left-15,right-15) supaya
        // benar2 MENUTUPI sebagian besar foto belakang -- permintaan
        // langsung pengguna, 21 September 2026: "gambar paling depan
        // tutupi gambar dibelakang nya dan biarkan sisa foto kanan kiri
        // yang tidak tertutup ... terlihat". Foto belakang digeser SEDIKIT
        // lebih dekat ke tengah juga (dulu left-1/right-31 & left-31/
        // right-1, sisi terbuka 14 poin persen) supaya sisi yang terbuka
        // jadi potongan tipis yang jelas "mengintip", bukan potongan besar
        // yang terasa seperti 3 kartu terpisah cuma bersinggungan dikit.
        // Inset atas foto belakang disamakan dgn bawah (dulu top-3%/
        // bottom-7% -- audit UI/UX 21 September 2026: intipan di ATAS jadi
        // lebih menonjol drpd di kanan-kiri, berlawanan dgn intent aslinya
        // "biarkan sisa foto kanan-kiri...yg tidak tertutup terlihat").
        // top-7%/bottom-7% simetris & sama2 LEBIH KECIL drpd intip
        // kanan-kiri (7% dari lebar wadah kipas yg landscape, jadi secara
        // piksel absolut tetap lebih lebar drpd 7% tinggi) -- kanan-kiri
        // kembali jadi sisi yg paling terlihat mengintip.
        [
          "left-[10%] right-[10%] top-[10%] bottom-[10%] rotate-0 z-30",
          "left-[3%] right-[26%] top-[7%] bottom-[7%] -rotate-6 z-20",
          "left-[26%] right-[3%] top-[7%] bottom-[7%] rotate-6 z-10",
        ]
      : ["inset-x-[6%] inset-y-[8%] rotate-0 z-30", "inset-x-[6%] inset-y-[8%] -rotate-6 z-20 scale-95", "inset-x-[6%] inset-y-[8%] rotate-6 z-10 scale-95"];
    return (
      <div className={cardClassName}>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Buka galeri ${title || ""}`.trim()}
          className="group flex w-full flex-col items-center gap-3 text-left"
        >
          <div className={isFan ? "relative aspect-[16/11] w-full" : "relative aspect-[4/3] w-full max-w-[420px]"}>
            {fan.map((src, i) => (
              <div
                key={src}
                className={`absolute overflow-hidden ${isFan ? "rounded-xl" : "rounded-2xl"} shadow-[0_10px_30px_rgba(0,0,0,0.25)] ring-1 ring-black/10 transition-transform duration-300 group-hover:scale-[1.02] ${tilt[i]}`}
              >
                <Image src={src} alt={captionFor(src).title || (title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`)} fill sizes={isFan ? "(max-width: 640px) 90vw, 448px" : "420px"} className="object-cover" />
                {/* Lencana cuma di foto DEPAN (i===0) -- foto belakang di
                    mode kipas cuma sisa tipis mengintip, badge di situ akan
                    terpotong/tidak kebaca. */}
                {i === 0 && nestedFor(src).length > 0 && (
                  <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <Images className="h-3 w-3" aria-hidden />
                    {nestedFor(src).length}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col items-center">
            {/* title opsional -- permintaan langsung pengguna, 19 September
                2026 ("judul blok juga itu optional untuk bisa ditampilkan"):
                mode grid galeri (renderTiles lain di file ini) sudah
                `{title && ...}` sejak awal, mode tumpukan/kipas ini
                sebelumnya SELALU merender baris judul (kosong pun tetap
                jadi baris kosong) -- disamakan, subjudul "Galeri · N foto"
                di bawah tetap tampil apa pun kondisinya. */}
            {title && (
              <p className={`flex items-center gap-1.5 ${isFan ? "text-2xl" : "text-lg"} font-bold leading-tight ${titleClassName}`}>
                {icon}
                <span>{title}</span>
              </p>
            )}
            <p className="mt-1 flex items-center gap-1.5 text-sm opacity-70">
              {isFan && <Images className="h-4 w-4" aria-hidden />}
              Galeri · {images.length} foto
            </p>
          </div>
        </button>

        {sheet.mounted &&
          createPortal(
            <div
              className={`fixed inset-0 z-[999] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6 ${overlayClass(sheet.visible)}`}
              onClick={() => setSheetOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={title || "Galeri foto"}
            >
              <div
                className={`relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border-t-2 border-[#111111] bg-white text-[#111111] shadow-2xl sm:rounded-[28px] sm:border-2 ${sheetPanelClass(sheet.visible)}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Handle geser -- penanda visual "lembar" di ponsel. */}
                <div className="mx-auto mt-2.5 h-1.5 w-10 flex-shrink-0 rounded-full bg-black/15 sm:hidden" aria-hidden />
                {title && (
                  <div className="flex-shrink-0 border-b border-black/5 px-6 py-4 text-center">
                    <h2 className="truncate text-base font-semibold">{title}</h2>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-6">
                  <div className="flex flex-col gap-8">
                    {images.map((src, i) => {
                      const cap = captionFor(src);
                      const nested = nestedFor(src);
                      const hasNested = nested.length > 0;
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
                          <button
                            type="button"
                            disabled={!hasNested}
                            onClick={() => setExpandedNestedFor((cur) => (cur === src ? null : src))}
                            aria-label={hasNested ? `Lihat ${nested.length} foto terkait` : undefined}
                            className={`relative block w-full ${hasNested ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <Image
                              src={src}
                              alt={cap.title || (title ? `${title} ${i + 1}` : `Foto ${i + 1}`)}
                              width={1200}
                              height={900}
                              sizes="(max-width: 640px) 100vw, 512px"
                              priority={i === 0}
                              className="h-auto w-full rounded-2xl object-cover"
                            />
                            {hasNested && (
                              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                                <Images className="h-3 w-3" aria-hidden />
                                {nested.length}
                              </span>
                            )}
                          </button>
                          {renderNestedStrip(src, "sheet")}
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
        {renderNestedViewer()}
      </div>
    );
  }

  const altFor = (src: string, i: number) => captionFor(src).title || (title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`);
  // Kelas scroll-strip tanpa scrollbar (carousel & circles): scrollbar
  // horizontal di dalam kartu blok cuma jadi noise, geser jari/trackpad
  // tetap jalan. Arbitrary variant Tailwind, bukan plugin baru.
  const hideScrollbar = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

  function renderTiles() {
    if (display === "carousel") {
      return (
        <div className={`-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 ${hideScrollbar}`}>
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Perbesar foto ${i + 1}`}
              className="relative aspect-[4/3] w-[82%] flex-shrink-0 snap-center cursor-zoom-in overflow-hidden rounded-2xl"
            >
              <Image src={src} alt={altFor(src, i)} fill sizes="(max-width: 640px) 82vw, 380px" className="object-cover" />
              {/* Lencana foto-di-dalam-foto (bug UI/UX ditemukan 21 September
                  2026, audit menyeluruh): SEBELUMNYA cuma muncul setelah foto
                  sudah dibuka membesar di lightbox -- di tampilan kompak
                  manapun tidak ada petunjuk foto mana yang punya sub-galeri,
                  pengunjung harus buka satu-satu semua foto untuk tahu.
                  Ditambahkan di SETIAP mode tampilan teaser/kompak (bukan
                  cuma di sini). */}
              {nestedFor(src).length > 0 && (
                <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  <Images className="h-2.5 w-2.5" aria-hidden />
                  {nestedFor(src).length}
                </span>
              )}
              <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                {i + 1}/{images.length}
              </span>
            </button>
          ))}
        </div>
      );
    }
    if (display === "collage") {
      // Kelompok 3 foto: 1 besar (2x2 sel) + 2 kecil bertumpuk di sisinya;
      // sisi foto besar berselang-seling per kelompok (kiri, kanan, kiri...)
      // supaya 9 foto tidak terasa seperti tiga baris yang sama. Sisa 1-2
      // foto di kelompok terakhir dirender penuh/berdua.
      const groups: string[][] = [];
      for (let i = 0; i < images.length; i += 3) groups.push(images.slice(i, i + 3));
      const tile = (src: string, i: number, className: string, sizes: string) => (
        <button key={src} type="button" onClick={() => setOpenIndex(i)} aria-label={`Perbesar foto ${i + 1}`} className={`relative cursor-zoom-in overflow-hidden rounded-lg ${className}`}>
          <Image src={src} alt={altFor(src, i)} fill sizes={sizes} className="object-cover transition-transform duration-200 hover:scale-105" />
          {nestedFor(src).length > 0 && (
            <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              <Images className="h-2.5 w-2.5" aria-hidden />
              {nestedFor(src).length}
            </span>
          )}
        </button>
      );
      return (
        <div className="flex flex-col gap-1.5">
          {groups.map((group, g) => {
            const offset = g * 3;
            if (group.length === 1) return <div key={g}>{tile(group[0], offset, "aspect-video w-full", "(max-width: 640px) 100vw, 448px")}</div>;
            if (group.length === 2) {
              return (
                <div key={g} className="grid grid-cols-2 gap-1.5">
                  {group.map((src, j) => tile(src, offset + j, "aspect-square w-full", "(max-width: 640px) 50vw, 220px"))}
                </div>
              );
            }
            const bigLeft = g % 2 === 0;
            return (
              <div key={g} className="grid grid-cols-3 grid-rows-2 gap-1.5">
                {tile(group[0], offset, bigLeft ? "col-start-1 col-span-2 row-start-1 row-span-2" : "col-start-2 col-span-2 row-start-1 row-span-2", "(max-width: 640px) 66vw, 300px")}
                {tile(group[1], offset + 1, `aspect-square ${bigLeft ? "col-start-3" : "col-start-1"} row-start-1`, "150px")}
                {tile(group[2], offset + 2, `aspect-square ${bigLeft ? "col-start-3" : "col-start-1"} row-start-2`, "150px")}
              </div>
            );
          })}
        </div>
      );
    }
    if (display === "masonry") {
      // columns-2 + break-inside-avoid: tinggi tiap foto mengikuti rasio
      // aslinya (width/height di next/image cuma tebakan awal, `h-auto`
      // yang menentukan) -- foto potret & lanskap bercampur rapi tanpa
      // perlu tahu dimensinya lebih dulu.
      return (
        <div className="columns-2 gap-1.5">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setOpenIndex(i)}
              aria-label={`Perbesar foto ${i + 1}`}
              className="relative mb-1.5 block w-full cursor-zoom-in overflow-hidden rounded-lg break-inside-avoid"
            >
              <Image src={src} alt={altFor(src, i)} width={600} height={800} sizes="(max-width: 640px) 50vw, 220px" className="h-auto w-full object-cover transition-transform duration-200 hover:scale-105" />
              {nestedFor(src).length > 0 && (
                <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                  <Images className="h-2.5 w-2.5" aria-hidden />
                  {nestedFor(src).length}
                </span>
              )}
            </button>
          ))}
        </div>
      );
    }
    if (display === "circles") {
      return (
        <div className={`flex gap-3 overflow-x-auto pb-1 ${hideScrollbar}`}>
          {images.map((src, i) => {
            const cap = captionFor(src);
            return (
              <button key={src} type="button" onClick={() => setOpenIndex(i)} aria-label={`Perbesar foto ${i + 1}`} className="flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5">
                <span className="relative block h-16 w-16 overflow-hidden rounded-full ring-2 ring-black/10">
                  <Image src={src} alt={altFor(src, i)} fill sizes="64px" className="object-cover" />
                  {nestedFor(src).length > 0 && (
                    <span className="pointer-events-none absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[8px] font-bold text-white">
                      {nestedFor(src).length}
                    </span>
                  )}
                </span>
                {cap.title && <span className="w-full truncate text-center text-[10px] font-semibold opacity-80">{cap.title}</span>}
              </button>
            );
          })}
        </div>
      );
    }
    return (
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
            <Image src={src} alt={altFor(src, i)} fill sizes="150px" className="object-cover transition-transform duration-200 hover:scale-105" />
            {nestedFor(src).length > 0 && (
              <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                <Images className="h-2.5 w-2.5" aria-hidden />
                {nestedFor(src).length}
              </span>
            )}
          </button>
        ))}
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
      {/* Netral, bukan gaya-error -- audit UI/UX 20 September 2026: laporan
          langsung pengguna, galeri kosong sebelumnya tampil sbg teks merah
          "Galeri belum berisi foto." di halaman PUBLIK, terlihat seperti
          error alih-alih sekadar belum diisi. Sama seperti AudioPlayerBlock.tsx. */}
      {images.length > 0 ? renderTiles() : <p className={`text-xs opacity-50 ${titleClassName}`}>Galeri belum berisi foto.</p>}

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
      {lightbox.mounted && shownIndex !== null && createPortal(
        <div
          className={`fixed inset-0 z-[999] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm ${overlayClass(lightbox.visible)}`}
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
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25"
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
                className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 sm:left-4"
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
                className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-white/25 sm:right-4"
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
          <div className={`flex max-h-full max-w-full flex-col items-center gap-3 ${zoomPanelClass(lightbox.visible)}`} onClick={(e) => e.stopPropagation()}>
            {/* <button> pembungkus (bukan onClick di <img> langsung) -- bug
                aksesibilitas keyboard ditemukan 21 September 2026 (audit
                menyeluruh): SEBELUMNYA reveal strip foto tambahan di sini
                cuma bisa dipicu mouse, pengguna keyboard-only/pembaca layar
                tidak bisa menjangkaunya sama sekali padahal Grid adalah mode
                bawaan. Lembar "stack"/"kipas" (renderNestedStrip pemanggil
                sheet) sudah benar pakai &lt;button&gt; sejak awal -- disamakan
                di sini. disabled kalau tidak ada foto tambahan sama sekali,
                supaya tidak jadi target tab-stop yang tidak melakukan apa-apa. */}
            <button
              type="button"
              disabled={nestedFor(images[shownIndex]).length === 0}
              onClick={() => setExpandedNestedFor((cur) => (cur === images[shownIndex] ? null : images[shownIndex]))}
              aria-label={nestedFor(images[shownIndex]).length > 0 ? `Lihat ${nestedFor(images[shownIndex]).length} foto terkait` : undefined}
              className={`relative block ${nestedFor(images[shownIndex]).length > 0 ? "cursor-pointer" : "cursor-default"}`}
            >
              {/* min-h -- bug UI/UX ditemukan 21 September 2026 (audit
                  menyeluruh), lihat catatan lengkap di renderNestedViewer:
                  foto lebih kecil dari viewport sebelumnya tampil mini di
                  tengah layar hitam kosong. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[shownIndex]}
                alt={captionFor(images[shownIndex]).title || (title ? `${title} ${shownIndex + 1}` : `Foto galeri ${shownIndex + 1}`)}
                className="max-h-[80vh] min-h-[40vh] max-w-full object-contain"
              />
              {nestedFor(images[shownIndex]).length > 0 && (
                <span className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white">
                  <Images className="h-3 w-3" aria-hidden />
                  {nestedFor(images[shownIndex]).length}
                </span>
              )}
            </button>
            {renderNestedStrip(images[shownIndex], "lightbox")}
            {(captionFor(images[shownIndex]).title || captionFor(images[shownIndex]).description) && (
              <div className="max-w-md text-center text-white">
                {captionFor(images[shownIndex]).title && <p className="text-sm font-bold">{captionFor(images[shownIndex]).title}</p>}
                {captionFor(images[shownIndex]).description && <p className="mt-0.5 whitespace-pre-line text-xs text-white/70">{captionFor(images[shownIndex]).description}</p>}
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tabular-nums text-white ring-1 ring-white/20 backdrop-blur-md">
              {shownIndex + 1} / {images.length}
            </div>
          )}
          {renderNestedViewer()}
        </div>,
        document.body
      )}
    </div>
  );
}
