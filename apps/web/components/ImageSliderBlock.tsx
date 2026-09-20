"use client";

import Image from "next/image";
import { useRef } from "react";
import { IconChevronRight } from "@/components/icons";

// ImageSliderBlock -- Canvas Page Builder Fase 3 (kategori MEDIA,
// permintaan langsung pengguna 8 September 2026): block_data IDENTIK
// dengan "gallery" (`images: string[]`, lihat validateBlockDataAtDepth
// case gabungan di links.go) -- SATU-SATUNYA beda dari GalleryBlock
// adalah render ini (baris geser horizontal + tombol panah), bukan grid
// statis. Pola scroll diadaptasi dari landing/Carousel.tsx (scroll-snap +
// scrollBy smooth) TANPA dependency carousel baru -- disalin ulang
// (bukan di-reuse langsung) karena landing/Carousel.tsx pakai token
// Tailwind marketing-only (border-border/bg-white), beda sistem dari
// `theme.*` yang dipakai render halaman publik kreator di sini.
export default function ImageSliderBlock({
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
  icon?: React.ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    const amount = row.firstElementChild ? row.firstElementChild.getBoundingClientRect().width + 12 : 200;
    row.scrollBy({ left: dir * amount, behavior: "smooth" });
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
        <div className="relative">
          <div ref={rowRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1">
            {images.map((src, i) => (
              // `h-auto` WAJIB menemani `aspect-video` setelah migrasi ke
              // next/image (audit performa 15 September 2026): atribut
              // width/height yang dipasang <Image> memberi elemen aspect-ratio
              // bawaan UA yang mengalahkan `aspect-video` selama tinggi bukan
              // `auto`. width/height 448x252 murni petunjuk srcset pada rasio
              // 16:9 selebar kolom publik; lebar tampil tetap 4/5 atau 3/5
              // kolom lewat CSS seperti sebelumnya.
              <Image
                key={i}
                src={src}
                alt={title ? `${title} ${i + 1}` : `Slide ${i + 1}`}
                width={448}
                height={252}
                className="aspect-video h-auto w-4/5 flex-shrink-0 snap-center rounded-lg object-cover sm:w-3/5"
              />
            ))}
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => scroll(-1)}
                aria-label="Sebelumnya"
                className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <IconChevronRight className="h-4 w-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => scroll(1)}
                aria-label="Berikutnya"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white"
              >
                <IconChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        // Netral, bukan gaya-error -- lihat catatan lengkap di AudioPlayerBlock.tsx.
        <p className={`text-xs opacity-50 ${titleClassName}`}>Slider belum berisi foto.</p>
      )}
    </div>
  );
}
