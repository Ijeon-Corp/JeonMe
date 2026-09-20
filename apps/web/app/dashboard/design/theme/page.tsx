"use client";

import PageSkeleton from "@/components/Skeleton";
import { useRouter } from "next/navigation";
import DesignPageShell from "@/components/DesignPageShell";
import { useDesignData } from "@/lib/useDesignData";
import { TemaSection } from "@/components/dashboard/page/design-sections";
import { uploadCustomBackground } from "@/lib/api-client";
import { useLocale } from "@/lib/locale-context";
import { useErrorToast } from "@/lib/use-error-toast";

// Galeri tema (tab Warna & Gradien/Wallpaper/3D-Live/Video/Doodle + tile
// Custom) diekstrak ke components/ThemeGallery.tsx, 27 Agustus 2026 --
// dipakai ULANG oleh tab "Theme" wizard Quick Setup (redesain ala alur
// "Microsite" s.id) supaya cuma ada SATU implementasi galeri tema, bukan
// dua yang bisa tidak sinkron. Halaman ini sekarang murni pembungkus:
// urus data (useDesignData) & gerbang Premium utk tile Custom, render
// galerinya lewat komponen bersama.
//
// TemaSection (bukan lagi <ThemeGallery> polos) -- permintaan langsung
// pengguna, 20 September 2026: "custom di design itu sebenernya apa
// fungsinya karena setelah klik tidak ada lanjutannya". Akar masalah:
// tile "Custom" MEMANG mengubah page.theme jadi "custom" (tersimpan,
// pratinjau kanan ikut berubah), tapi panel lanjutan (pilih warna solid/
// gradien/gambar) HANYA pernah dipasang di TemaSection (design-sections.tsx,
// diekstrak dari ProdukPageEditor.tsx 9 September 2026 KHUSUS utk
// Toko+Canvas Builder, dengan catatan eksplisit "Bio sengaja tidak
// disentuh") -- halaman Bio ini cuma memanggil <ThemeGallery> mentah
// tanpa panel lanjutannya sama sekali, jalan buntu murni oversight
// cakupan, bukan keputusan disengaja utk Bio. Sekarang dipakai ulang APA
// ADANYA (komponen sudah generik lintas MyPage/ExtraPageDetail sejak
// awal diekstrak), bukan reimplementasi ketiga.
export default function DesignThemePage() {
  const { t } = useLocale();
  const { page, links, products, loading, error, setError, handlePageSettingChange } = useDesignData();
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

      {/* Bug dilaporkan pengguna (27 Juli 2026): "jika pilih tema warna
          button text button dan juga semua warna font dan tipe font juga
          ikut disesuaikan berdasarkan tema yang dipilih jadi bukan
          background nya saja yang berubah" -- akar masalah: custom_style_
          override (diaktifkan begitu kreator pernah menyentuh panel Tombol/
          Font) TIDAK pernah direset saat memilih tema baru, jadi warna
          tombol/font KUSTOM lama tetap "menang" menimpa warna bawaan tema
          yang baru dipilih (button/nama/bio-nya sendiri sebenarnya SUDAH
          berbeda per tema di PAGE_THEMES, tapi tertutup override lama).
          TemaSection SELALU mereset override ke false saat memilih tema
          (persis logika yang tadinya di sini) -- kreator yang mau
          menyesuaikan lagi secara manual tetap bisa lewat panel Tombol/
          Font seperti biasa. */}
      <div className="mt-4">
        <TemaSection
          page={page}
          isPremium={page.is_premium}
          onPatch={handlePageSettingChange}
          onError={setError}
          onUploadBackground={async (file) => (await uploadCustomBackground(file)).custom_background_value}
          onLocked={() => router.push("/dashboard/settings/subscription")}
        />
      </div>
    </DesignPageShell>
  );
}
