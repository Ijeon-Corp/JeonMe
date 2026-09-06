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
export default function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-wide text-app-muted">{label}</span>
        {children}
      </label>
      {hint && <p className="text-[10.5px] text-app-muted">{hint}</p>}
    </div>
  );
}
