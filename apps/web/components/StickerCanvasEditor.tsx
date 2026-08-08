"use client";

import { useEffect, useRef, useState } from "react";
import { PageStickerData } from "@/lib/api-client";
import StickerIcon, { STICKER_SHAPES } from "@/components/StickerIcon";
import { IconPlus, IconTrash } from "@/components/icons";

// StickerCanvasEditor -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026): "stiker harusnya interaktif, bisa diubah posisi/size lewat
// pratinjau" -- drag untuk posisi, seret gagang pojok untuk ukuran,
// langsung di kanvas persegi panjang yang merepresentasikan halaman publik
// (bukan mockup penuh -- background/tema TIDAK direplikasi di sini, murni
// area kerja posisi relatif, supaya tidak perlu menyinkronkan seluruh
// PagePreview di dalam mode edit terpisah ini).
//
// x/y disimpan sebagai PERSEN (0-100) dari kanvas, TITIK TENGAH stiker --
// proporsional di ukuran layar apa pun (lihat StickerBadge/PagePreview.tsx
// untuk render sungguhan di halaman publik, pakai rumus posisi yang sama).
export default function StickerCanvasEditor({
  stickers,
  onChange,
}: {
  stickers: PageStickerData[];
  onChange: (stickers: PageStickerData[]) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState<PageStickerData[]>(stickers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragState = useRef<{ id: string; mode: "move" | "resize" } | null>(null);

  // Sinkron ulang kalau prop berubah dari luar (mis. halaman baru selesai
  // dimuat) -- TIDAK dipakai untuk update selama drag aktif sendiri (drag
  // mengandalkan state lokal untuk terasa responsif). Pola "adjust state
  // saat render" (bukan useEffect+setState -- lihat catatan sama di commit
  // sebelumnya soal react-hooks/set-state-in-effect): React docs SENGAJA
  // membolehkan setState LANGSUNG di badan komponen kalau dijaga kondisi
  // pembanding seperti ini, render ekstra langsung "dibuang" sebelum commit
  // ke layar, bukan effect terpisah yang baru jalan SETELAH commit pertama.
  const [prevStickersProp, setPrevStickersProp] = useState(stickers);
  if (stickers !== prevStickersProp) {
    setPrevStickersProp(stickers);
    setLocal(stickers);
  }

  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      const drag = dragState.current;
      const canvas = canvasRef.current;
      if (!drag || !canvas) return;
      const rect = canvas.getBoundingClientRect();

      setLocal((prev) =>
        prev.map((s) => {
          if (s.id !== drag.id) return s;
          if (drag.mode === "move") {
            const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
            const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
            return { ...s, x, y };
          }
          // resize -- skala dari jarak pointer ke titik tengah stiker,
          // dinormalisasi terhadap ~1/6 lebar kanvas supaya rasio terasa wajar.
          const centerX = rect.left + (s.x / 100) * rect.width;
          const centerY = rect.top + (s.y / 100) * rect.height;
          const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);
          const scale = clamp(dist / (rect.width / 6), 0.4, 2.5);
          return { ...s, scale };
        })
      );
    }
    function handlePointerUp() {
      if (dragState.current) {
        dragState.current = null;
        setLocal((current) => {
          onChange(current);
          return current;
        });
      }
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [onChange]);

  function handleAdd(type: string) {
    const next = [...local, { id: crypto.randomUUID(), type, x: 50, y: 50, scale: 1 }];
    setLocal(next);
    onChange(next);
    setSelectedId(next[next.length - 1].id);
  }

  function handleDelete(id: string) {
    const next = local.filter((s) => s.id !== id);
    setLocal(next);
    onChange(next);
    if (selectedId === id) setSelectedId(null);
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

      <div>
        <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-ink">
          <IconPlus className="h-3 w-3" />
          Seret untuk pindah, tarik gagang pojok kanan-bawah untuk ubah ukuran
        </p>
        <div
          ref={canvasRef}
          onPointerDown={() => setSelectedId(null)}
          className="relative mx-auto aspect-[9/16] w-full max-w-[260px] touch-none overflow-hidden rounded-2xl border border-dashed border-border bg-ink/5"
        >
          {local.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-muted">
              Belum ada stiker -- klik salah satu bentuk di atas untuk menambahkan.
            </p>
          )}
          {local.map((s) => (
            <div
              key={s.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture(e.pointerId);
                dragState.current = { id: s.id, mode: "move" };
                setSelectedId(s.id);
              }}
              style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -50%) scale(${s.scale})` }}
              className={`absolute flex h-14 w-14 cursor-grab items-center justify-center text-ink active:cursor-grabbing ${
                selectedId === s.id ? "z-10" : ""
              }`}
            >
              <StickerIcon type={s.type} className="h-full w-full drop-shadow" />
              {selectedId === s.id && (
                <>
                  <span className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2" />
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(s.id);
                    }}
                    className="absolute -right-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow-card"
                  >
                    <IconTrash className="h-3 w-3" />
                  </button>
                  <span
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.target as Element).setPointerCapture(e.pointerId);
                      dragState.current = { id: s.id, mode: "resize" };
                    }}
                    className="absolute -bottom-2 -right-2 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-primary shadow-card"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
