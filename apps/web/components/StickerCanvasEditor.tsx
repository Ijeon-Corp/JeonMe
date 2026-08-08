"use client";

import { PageStickerData } from "@/lib/api-client";
import StickerIcon, { STICKER_SHAPES } from "@/components/StickerIcon";
import { IconPlus, IconTrash } from "@/components/icons";

// StickerCanvasEditor -- Modul Desain (koreksi langsung pengguna, 8
// Agustus 2026, disempurnakan lagi hari yang sama): "harusnya bagian
// stiker itu langsung edit di bagian pratinjau nya jadi melakukan resize
// atau ubah posisi di bagian pratinjau" -- SEBELUMNYA komponen ini
// merender kanvas mockup terpisah (kotak 9:16 polos) untuk drag/resize,
// TIDAK merefleksikan tema/avatar/tata letak halaman sungguhan. Drag/
// resize SEKARANG terjadi LANGSUNG di panel Pratinjau Langsung asli
// (lihat StickerOverlay di PagePreview.tsx, dipicu lewat prop
// editableStickers/onStickersChange yang diteruskan dari
// LivePreviewPanel/DesignPageShell/ProdukPageEditor) -- komponen ini
// sekarang MURNI palet "tambah stiker" + daftar untuk hapus/kelola tanpa
// perlu menyeret (penting untuk aksesibilitas & layar sempit yang belum
// scroll sampai panel pratinjau).
export default function StickerCanvasEditor({
  stickers,
  onChange,
}: {
  stickers: PageStickerData[];
  onChange: (stickers: PageStickerData[]) => void;
}) {
  function handleAdd(type: string) {
    // Sebar posisi awal tiap stiker baru (bukan selalu x=50,y=50) supaya
    // beberapa stiker sekaligus tidak menumpuk persis di tengah -- kreator
    // tetap bebas menggeser lagi lewat pratinjau.
    const offset = stickers.length % 5;
    const next = [
      ...stickers,
      { id: crypto.randomUUID(), type, x: 35 + offset * 8, y: 25 + offset * 12, scale: 1 },
    ];
    onChange(next);
  }

  function handleDelete(id: string) {
    onChange(stickers.filter((s) => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink">Tambah Stiker</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {STICKER_SHAPES.map((shape) => (
            <button
              key={shape.value}
              type="button"
              onClick={() => handleAdd(shape.value)}
              title={`Tambah ${shape.label}`}
              className="flex aspect-square flex-col items-center justify-center rounded-xl border border-border bg-white p-2 text-ink hover:border-primary hover:text-primary"
            >
              <StickerIcon type={shape.value} className="h-6 w-6" />
            </button>
          ))}
        </div>
      </div>

      <p className="flex items-center gap-1 text-xs font-semibold text-primary">
        <IconPlus className="h-3 w-3" />
        Seret & ubah ukuran langsung di panel Pratinjau Langsung di samping.
      </p>

      {stickers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-ink">Stiker Terpasang ({stickers.length})</p>
          {stickers.map((s) => {
            const meta = STICKER_SHAPES.find((shape) => shape.value === s.type);
            return (
              <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-white p-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink">
                  <StickerIcon type={s.type} className="h-5 w-5" />
                </span>
                <p className="flex-1 truncate text-xs font-semibold text-ink">{meta?.label ?? s.type}</p>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
