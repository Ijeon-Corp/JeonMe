"use client";

import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";

// DesignStickerPage -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026, disempurnakan lagi hari yang sama: "langsung edit di bagian
// pratinjau nya"): seret untuk posisi & tarik gagang pojok untuk ukuran
// terjadi LANGSUNG di panel Pratinjau Langsung kanan (editableStickers
// diteruskan ke DesignPageShell -> LivePreviewPanel -> PagePreview), palet
// "Tambah Stiker" tetap di kolom kiri (lihat StickerCanvasEditor). Pola
// halaman tetap sama dengan theme/header/tombol/font (DesignPageShell +
// useDesignData).
export default function DesignStickerPage() {
  const { page, loading, error, links, products, handleStickersChange } = useDesignData();

  if (loading || !page) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title="Stiker"
      description="Tempel stiker dekoratif di halaman publikmu -- seret untuk pindah, tarik gagang pojok untuk ubah ukuran, langsung di panel pratinjau."
      editableStickers
      onStickersChange={handleStickersChange}
    >
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mt-4 rounded-2xl border border-border bg-white p-5 shadow-card">
        <StickerCanvasEditor stickers={page.stickers} onChange={handleStickersChange} />
      </section>
    </DesignPageShell>
  );
}
