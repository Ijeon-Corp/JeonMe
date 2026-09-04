"use client";

import PageSkeleton from "@/components/Skeleton";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import StickerCanvasEditor from "@/components/StickerCanvasEditor";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// DesignStickerPage -- Modul Desain (koreksi langsung pengguna, 8 Agustus
// 2026, disempurnakan lagi hari yang sama: "langsung edit di bagian
// pratinjau nya"): seret untuk posisi & tarik gagang pojok untuk ukuran
// terjadi LANGSUNG di panel Pratinjau Langsung kanan (editableStickers
// diteruskan ke DesignPageShell -> LivePreviewPanel -> PagePreview), palet
// "Tambah Stiker" tetap di kolom kiri (lihat StickerCanvasEditor). Pola
// halaman tetap sama dengan theme/header/tombol/font (DesignPageShell +
// useDesignData).
export default function DesignStickerPage() {
  const { t } = useLocale();
  const { page, loading, error, links, products, handleStickersChange } = useDesignData();
  useErrorToast(error);

  if (loading || !page) return <PageSkeleton />;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title={t("dashboard.pages.designSticker.title")}
      description={t("dashboard.pages.designSticker.description")}
      editableStickers
      onStickersChange={handleStickersChange}
    >

      <section className="glass mt-4 rounded-jlg p-5 shadow-card">
        <StickerCanvasEditor stickers={page.stickers} onChange={handleStickersChange} />
      </section>
    </DesignPageShell>
  );
}
