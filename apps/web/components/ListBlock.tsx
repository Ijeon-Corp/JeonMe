// ListBlock -- Canvas Page Builder Fase 3 (kategori INFORMATION,
// gabungan "Card/List/Testimony" dari peta jalan awal jadi SATU
// block_type fleksibel "list", dikonfirmasi via AskUserQuestion 8
// September 2026): `style` menentukan tampilan dari data yang SAMA
// persis (`items: {title, description?, author?}[]`) -- "list" (baris
// ikon+judul+deskripsi, mirip FAQ tanpa accordion), "card" (grid kartu),
// "testimony" (kartu kutipan + nama, TANPA foto author -- lihat catatan
// lingkup di plan Fase 3, upload foto per-item butuh pola baru mirip
// UploadCatalogItemImage yang tidak dikerjakan sekarang). Server Component
// murni (tidak ada interaktivitas), pola sama FaqBlock/GalleryBlock.
export interface ListBlockItem {
  title: string;
  description?: string;
  author?: string;
}

export default function ListBlock({
  title,
  style,
  items,
  cardClassName,
  titleClassName,
  itemTitleClassName,
  itemBodyClassName,
  icon,
}: {
  title: string;
  style: "list" | "card" | "testimony";
  items: ListBlockItem[];
  cardClassName: string;
  titleClassName: string;
  itemTitleClassName: string;
  itemBodyClassName: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cardClassName}>
      {title && (
        <p className={`mb-2 flex items-center gap-1.5 truncate text-sm font-semibold ${titleClassName}`}>
          {icon}
          <span className="truncate">{title}</span>
        </p>
      )}
      {items.length === 0 ? (
        <p className="text-xs text-red-500">Belum ada item.</p>
      ) : style === "card" ? (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-current/10 p-2.5">
              <p className={`text-xs font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.description && <p className={`mt-1 text-[11px] ${itemBodyClassName}`}>{item.description}</p>}
            </div>
          ))}
        </div>
      ) : style === "testimony" ? (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="rounded-lg border border-current/10 p-3">
              <p className={`text-2xl leading-none ${itemTitleClassName}`} aria-hidden="true">
                &ldquo;
              </p>
              {item.description && <p className={`text-xs italic ${itemBodyClassName}`}>{item.description}</p>}
              <p className={`mt-2 text-[11px] font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.author && <p className={`text-[11px] ${itemBodyClassName}`}>{item.author}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-current/10">
          {items.map((item, i) => (
            <div key={i} className="py-2">
              <p className={`text-xs font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.description && <p className={`mt-0.5 text-[11px] ${itemBodyClassName}`}>{item.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
