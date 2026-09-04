"use client";

import PageSkeleton from "@/components/Skeleton";
import { useRouter } from "next/navigation";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import ThemeGallery from "@/components/ThemeGallery";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// Galeri tema (tab Warna & Gradien/Wallpaper/3D-Live/Video/Doodle + tile
// Custom) diekstrak ke components/ThemeGallery.tsx, 27 Agustus 2026 --
// dipakai ULANG oleh tab "Theme" wizard Quick Setup (redesain ala alur
// "Microsite" s.id) supaya cuma ada SATU implementasi galeri tema, bukan
// dua yang bisa tidak sinkron. Halaman ini sekarang murni pembungkus:
// urus data (useDesignData) & gerbang Premium utk tile Custom, render
// galerinya lewat komponen bersama.
export default function DesignThemePage() {
  const { t } = useLocale();
  const { page, links, products, loading, error, handlePageSettingChange } = useDesignData();
  useErrorToast(error);
  const router = useRouter();

  if (loading || !page) return <PageSkeleton />;

  return (
    <DesignPageShell
      page={page}
      links={links}
      products={products}
      backHref="/dashboard/design"
      title={t("dashboard.pages.designTheme.title")}
      description={t("dashboard.pages.designTheme.description")}
    >

      <section className="glass mt-4 rounded-jlg p-5 shadow-card">
        {/* Bug dilaporkan pengguna (27 Juli 2026): "jika pilih tema warna
            button text button dan juga semua warna font dan tipe font juga
            ikut disesuaikan berdasarkan tema yang dipilih jadi bukan
            background nya saja yang berubah" -- akar masalah: custom_style_
            override (diaktifkan begitu kreator pernah menyentuh panel Tombol/
            Font) TIDAK pernah direset saat memilih tema baru, jadi warna
            tombol/font KUSTOM lama tetap "menang" menimpa warna bawaan tema
            yang baru dipilih (button/nama/bio-nya sendiri sebenarnya SUDAH
            berbeda per tema di PAGE_THEMES, tapi tertutup override lama).
            Memilih tema dari galeri ini sekarang SELALU mereset override ke
            false supaya kombinasi warna & font bawaan tema yang baru dipilih
            langsung berlaku penuh -- kreator yang mau menyesuaikan lagi
            secara manual tetap bisa lewat panel Tombol/Font seperti biasa. */}
        <ThemeGallery
          value={page.theme}
          onChange={(theme) => handlePageSettingChange({ theme, custom_style_override: false })}
          customTile={{
            isPremium: page.is_premium,
            onSelect: () => handlePageSettingChange({ theme: "custom", custom_style_override: false }),
            onLocked: () => router.push("/dashboard/settings/subscription"),
          }}
        />
      </section>
    </DesignPageShell>
  );
}
