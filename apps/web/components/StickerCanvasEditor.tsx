"use client";

import { PageStickerData } from "@/lib/api-client";
import StickerIcon, { FLUENT_STICKERS, STICKER_SHAPES, stickerLabel } from "@/components/StickerIcon";
import { IconPlus, IconTrash } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

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
  const { t } = useLocale();

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
        <p className="mb-1.5 text-xs font-semibold text-app-ink">{t("dashboard.components.stickerCanvasEditor.addStickerLabel")}</p>
        {/* Dua grup (24 Sept 2026): stiker garis lama + emoji 3D Fluent. */}
        {[
          { key: "line", heading: t("dashboard.components.stickerCanvasEditor.lineGroup"), items: STICKER_SHAPES, iconClass: "h-6 w-6" },
          { key: "emoji3d", heading: t("dashboard.components.stickerCanvasEditor.emoji3dGroup"), items: FLUENT_STICKERS, iconClass: "h-8 w-8" },
        ].map((group) => (
          <div key={group.key} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">{group.heading}</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {group.items.map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  onClick={() => handleAdd(shape.value)}
                  title={t("dashboard.components.stickerCanvasEditor.addStickerTitle").replace("{shape}", shape.label)}
                  aria-label={t("dashboard.components.stickerCanvasEditor.addStickerTitle").replace("{shape}", shape.label)}
                  className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-jeon-ink bg-app-surface p-2 text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
                >
                  <StickerIcon type={shape.value} className={group.iconClass} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="flex items-center gap-1 text-xs font-semibold text-jeon-purple">
        <IconPlus className="h-3 w-3" />
        {t("dashboard.components.stickerCanvasEditor.dragHint")}
      </p>

      {stickers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-app-ink">
            {t("dashboard.components.stickerCanvasEditor.installedStickers").replace("{count}", String(stickers.length))}
          </p>
          {stickers.map((s) => {
            return (
              <div key={s.id} className="flex items-center gap-2.5 rounded-xl border-2 border-jeon-ink bg-app-surface p-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink/5 text-app-ink">
                  <StickerIcon type={s.type} className="h-5 w-5" />
                </span>
                <p className="flex-1 truncate text-xs font-semibold text-app-ink">{stickerLabel(s.type) ?? s.type}</p>
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="flex-shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-red-50 hover:text-red-600"
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
