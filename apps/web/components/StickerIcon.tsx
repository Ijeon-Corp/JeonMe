// StickerIcon -- Modul Desain (koreksi langsung pengguna, 8 Agustus 2026):
// bentuk stiker SVG garis/flat -- terinspirasi galeri stiker Pinterest
// (panah/kursor/dekoratif) di referensi pengguna, TAPI sengaja bukan
// tiruan gaya glossy 3D/tekstur foto (itu butuh aset ilustrasi asli, di
// luar kemampuan membuat SVG path manual). "value" tiap bentuk HARUS
// sinkron dengan availableStickerTypes di page.go.
export const STICKER_SHAPES: { value: string; label: string }[] = [
  { value: "arrow-curve", label: "Panah Lengkung" },
  { value: "arrow-straight", label: "Panah Lurus" },
  { value: "arrow-sketch", label: "Panah Sketsa" },
  { value: "cursor-pixel", label: "Kursor Piksel" },
  { value: "cursor-hand", label: "Kursor Tangan" },
  { value: "pointing-hand", label: "Tangan Menunjuk" },
  { value: "star-sketch", label: "Bintang Sketsa" },
  { value: "heart-sketch", label: "Hati Sketsa" },
];

export default function StickerIcon({ type, className = "" }: { type: string; className?: string }) {
  switch (type) {
    case "arrow-curve":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M22 20c-4 24 4 46 26 54"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          <path d="M32 62 L46 78 L62 68 Z" fill="currentColor" />
        </svg>
      );
    case "arrow-straight":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 18 L74 74" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
          <path d="M78 50 L78 82 L46 82 Z" fill="currentColor" />
        </svg>
      );
    case "arrow-sketch":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 24 C 40 20, 46 40, 30 48 C 60 44, 72 56, 68 78"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path d="M52 68 L68 78 L70 60" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "cursor-pixel":
      return (
        <svg viewBox="0 0 100 100" className={className} xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges">
          <path
            d="M20 12 H32 V24 H44 V36 H56 V48 H44 V60 H56 V72 H44 V84 H32 V72 H20 Z"
            fill="currentColor"
          />
        </svg>
      );
    case "cursor-hand":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M38 20 a7 7 0 0 1 14 0 v18 a6 6 0 0 1 12 1 v6 a6 6 0 0 1 12 1 v20 c0 16-10 26-24 26 h-4 c-10 0-16-4-22-14 L14 60 a7 7 0 0 1 11-8 l7 6 V20 a7 7 0 0 1 7-7 a7 7 0 0 1 7 7 z"
            fill="currentColor"
          />
        </svg>
      );
    case "pointing-hand":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="14" y="58" width="28" height="20" rx="4" fill="currentColor" opacity="0.55" />
          <path
            d="M40 78 V32 a7 7 0 0 1 14 0 v20 a6 6 0 0 1 12 1 v4 a6 6 0 0 1 12 2 v6 a6 6 0 0 1 12 2 v13 c0 13-9 21-22 21 H54 c-8 0-11-2-14-8 Z"
            fill="currentColor"
          />
        </svg>
      );
    case "star-sketch":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M50 12 L61 38 L89 41 L68 60 L74 88 L50 73 L26 88 L32 60 L11 41 L39 38 Z"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );
    case "heart-sketch":
      return (
        <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M50 86 C 20 64, 8 46, 8 30 a18 18 0 0 1 34-8 a18 18 0 0 1 34 8 c0 16-12 34-42 56 Z"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
    default:
      return null;
  }
}
