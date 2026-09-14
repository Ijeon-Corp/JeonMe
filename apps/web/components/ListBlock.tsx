import { sanitizeRichTextHtml } from "@/lib/sanitize-rich-text";

// renderDescription -- deskripsi item/kutipan testimoni SEKARANG rich text
// (susulan 12 September 2026, "tiap blok yang ada teks nya buat semua
// jadi rich teks", dikonfirmasi via AskUserQuestion: field isi/deskripsi
// panjang saja) -- whitespace-pre-line utk kompatibilitas mundur item
// lama (plain string dgn newline literal, TANPA tag <p>/<br>), pola SAMA
// PERSIS blok "text" (PagePreview.tsx).
function renderDescription(description: string, className: string): React.ReactNode {
  return (
    <p
      className={`jeon-rich-text-content whitespace-pre-line ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(description) }}
    />
  );
}

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
  // url -- susulan 14 September 2026 (permintaan langsung pengguna: blok
  // List sebelumnya murni dekoratif, tidak bisa diklik sama sekali --
  // dengan field ini item bisa jadi navigasi fungsional, mis. testimoni
  // yang link ke ulasan asli, atau item daftar yang link ke produk/halaman
  // lain). Opsional, kompatibel mundur dgn item lama yang belum punya field ini.
  url?: string;
}

// ItemWrapper -- item jadi `<a>` kalau `url` terisi (Server Component,
// tidak perlu JS -- `<a>` polos cukup), tetap `<div>` kalau kosong supaya
// item TANPA url tidak terkesan seperti tautan yang bisa diklik.
function ItemWrapper({ url, className, children }: { url?: string; className: string; children: React.ReactNode }) {
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={`${className} block transition-opacity hover:opacity-80`}>
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
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
            <ItemWrapper key={i} url={item.url} className="rounded-lg border border-current/10 p-2.5">
              <p className={`text-xs font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.description && renderDescription(item.description, `mt-1 text-[11px] ${itemBodyClassName}`)}
            </ItemWrapper>
          ))}
        </div>
      ) : style === "testimony" ? (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <ItemWrapper key={i} url={item.url} className="rounded-lg border border-current/10 p-3">
              <p className={`text-2xl leading-none ${itemTitleClassName}`} aria-hidden="true">
                &ldquo;
              </p>
              {item.description && renderDescription(item.description, `text-xs italic ${itemBodyClassName}`)}
              <p className={`mt-2 text-[11px] font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.author && <p className={`text-[11px] ${itemBodyClassName}`}>{item.author}</p>}
            </ItemWrapper>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-current/10">
          {items.map((item, i) => (
            <ItemWrapper key={i} url={item.url} className="py-2">
              <p className={`text-xs font-semibold ${itemTitleClassName}`}>{item.title}</p>
              {item.description && renderDescription(item.description, `mt-0.5 text-[11px] ${itemBodyClassName}`)}
            </ItemWrapper>
          ))}
        </div>
      )}
    </div>
  );
}
