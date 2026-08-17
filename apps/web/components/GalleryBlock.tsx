// Blok "gallery" (hasil analisa galeri tema kompetitor, 17 Agustus 2026 --
// template portofolio/wisata s.id memakai grid multi-foto yang belum ada
// padanannya di Jeonme, blok "image" lama cuma 1 foto per blok). Server
// Component murni (tidak butuh interaktivitas -- tanpa lightbox, sengaja
// dibatasi lingkupnya supaya konsisten dengan blok lain yang juga tampilan
// murni, mis. VideoEmbedBlock/MapsEmbedBlock).
export default function GalleryBlock({
  title,
  images,
  cardClassName,
  titleClassName,
  icon,
}: {
  title: string;
  images: string[];
  cardClassName: string;
  titleClassName: string;
  // icon -- permintaan langsung pengguna, 14 Agustus 2026: ikon kustom/galeri
  // yang dipilih dari dashboard (lihat resolveBlockIcon di PagePreview.tsx).
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
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={title ? `${title} ${i + 1}` : `Foto galeri ${i + 1}`}
              loading="lazy"
              className="aspect-square w-full rounded-lg object-cover"
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-red-500">Galeri belum berisi foto.</p>
      )}
    </div>
  );
}
