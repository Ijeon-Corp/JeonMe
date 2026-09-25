"use client";

import { useLocale } from "@/lib/locale-context";

// FormField -- dipindahkan dari app/dashboard/links/page.tsx (6 September
// 2026, redesain editor Katalog/FAQ jadi drill-down gaya Linktree, lihat
// components/BlockDrilldownEditor.tsx) supaya dipakai bersama, TANPA import
// silang antara komponen dynamic-loaded dan page.tsx yang memuatnya.
//
// <label> HANYA membungkus judul+input (accessible name tetap bersih), hint
// jadi teks biasa di bawahnya, murni visual -- dipisah begini karena regresi
// e2e sungguhan sebelumnya: kalau hint (kalimat bebas) ikut masuk ke dalam
// <label>, teksnya ikut MASUK ke accessible name field ini (label membungkus
// mengumpulkan SELURUH teks di dalamnya), bikin nama field jadi panjang &
// bisa TIDAK SENGAJA bertabrakan dengan nama field lain (mis. hint field
// Deskripsi kebetulan memuat kata "judul", jadi getByLabel("Judul") ikut
// cocok ke field Deskripsi juga).
//
// optional -- chip kecil "Opsional" di samping label (permintaan langsung
// pengguna, 25 September 2026: "untuk beberapa inputan yang optional kasih
// bacaan optional nya contoh kecil nya di blok title"). Label lama yang
// MENULIS "(opsional)"/"(optional)" di teksnya otomatis dirender dgn chip
// yang sama (akhiran dibuang dari teks) supaya tampilannya seragam. Chip
// aria-hidden: accessible name field tetap "Judul", bukan "Judul Opsional"
// (field opsional memang tidak ber-atribut required).
const OPTIONAL_SUFFIX = /\s*\((opsional|optional)\)\s*$/i;

export default function FormField({
  label,
  hint,
  optional = false,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const hasSuffix = OPTIONAL_SUFFIX.test(label);
  const text = hasSuffix ? label.replace(OPTIONAL_SUFFIX, "") : label;
  const showChip = optional || hasSuffix;
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">
          {text}
          {showChip && (
            <span aria-hidden className="rounded-full bg-app-surface-2 px-1.5 py-px text-[10px] font-semibold normal-case tracking-normal text-app-muted">
              {t("dashboard.pages.links.common.optional")}
            </span>
          )}
        </span>
        {children}
      </label>
      {hint && <p className="text-[10.5px] text-app-muted">{hint}</p>}
    </div>
  );
}
