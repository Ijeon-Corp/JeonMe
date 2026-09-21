import { IconInbox } from "@/components/icons";

// AdminEmptyState -- bug UI/UX ditemukan 21 September 2026 (audit
// menyeluruh): 3 gaya empty-state berbeda dipakai berdampingan di 7
// sub-halaman admin (polos tanpa border, dashed-border, dan tabel tanpa
// ikon sama sekali) -- satu komponen bersama supaya konsisten, pola sama
// dengan alasan components/EmptyState.tsx dibuat untuk dashboard kreator.
// SENGAJA komponen TERPISAH dari EmptyState.tsx dashboard (bukan reuse) --
// gaya visual admin (baris ringkas dashed-border di dalam daftar/tabel
// padat) beda total dari gaya EmptyState dashboard (kartu besar gaya
// homepage, ikon badge 56px, CTA di dalam kotak) yang akan terlihat terlalu
// besar/tidak pas dipakai di admin.
//
// `colSpan` -- varian utk dipakai di dalam <tbody> (mis.
// admin/traffic-sources) yang butuh elemen <tr><td> valid, bukan <div>
// biasa (tidak valid sbg anak langsung <tbody>).
export default function AdminEmptyState({ text, colSpan }: { text: React.ReactNode; colSpan?: number }) {
  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan} className="px-4 py-6 text-center text-sm text-app-muted">
          <span className="inline-flex items-center gap-2">
            <IconInbox className="h-4 w-4 flex-shrink-0" />
            {text}
          </span>
        </td>
      </tr>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-app-border bg-app-surface/60 px-4 py-6 text-sm text-app-muted">
      <IconInbox className="h-4 w-4 flex-shrink-0" />
      {text}
    </div>
  );
}
