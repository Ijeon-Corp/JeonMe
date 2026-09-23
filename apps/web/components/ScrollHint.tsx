"use client";

import { IconChevronRight } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// ScrollHint.tsx -- perbaikan 23 September 2026 (audit UX, "tabel data
// (Manajer Audiens, riwayat Pesanan) scroll horizontal di mobile tanpa
// afordansi visual apa pun -- kolom terakhir terpotong persis di tepi layar
// tanpa fade/shadow/petunjuk 'geser'"). Dikonfirmasi live: tombol "Edit" di
// kolom paling kanan (aksi paling penting per baris) sama sekali tidak
// kelihatan di 390px tanpa sengaja menggeser tabel duluan.
//
// SENGAJA teks statis (`sm:hidden`, viewport < 640px), BUKAN deteksi
// overflow via JS -- tabel-tabel ini SELALU overflow di lebar mobile (banyak
// kolom, lebar minimum tiap kolom tidak menyusut), jadi hint statis cukup
// tanpa kompleksitas ResizeObserver. Ditaruh di ATAS wrapper
// `overflow-x-auto`, bukan fade-mask CSS di pinggir tabel -- fade-mask
// beresiko tampil aneh (potongan gradient di atas area kosong) kalau suatu
// saat tabel ini punya sedikit kolom dan pas muat tanpa overflow.
export default function ScrollHint() {
  const { t } = useLocale();
  return (
    <div className="flex items-center justify-end gap-1 px-1 pb-1.5 text-[11px] font-medium text-app-muted sm:hidden">
      <span>{t("dashboard.components.scrollHint.text")}</span>
      <IconChevronRight className="h-3 w-3" />
    </div>
  );
}
