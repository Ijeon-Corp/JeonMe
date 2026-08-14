// JsonLd -- perbaikan SEO (temuan audit, 15 Agustus 2026): render
// structured data (schema.org) sebagai <script type="application/ld+json">.
// Escape "<" jadi "<" (bukan cuma JSON.stringify polos) -- mencegah
// isi JSON diam-diam menutup tag <script> lebih awal kalau suatu saat
// data di dalamnya memuat karakter itu (defense-in-depth, konten saat ini
// semua statis/tepercaya, tapi pola amannya sama dengan render JSON
// apapun ke dalam HTML).
export default function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
