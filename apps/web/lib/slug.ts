// slugifyTitle -- dipakai jalur "+ Page" (Link Bio) & "+ Toko" (Produk &
// Monetisasi) yang cuma minta judul, TANPA field slug terpisah, untuk
// halaman Bio/Landing/Toko tambahan -- slug diturunkan otomatis dari judul,
// kreator tidak perlu tahu konsep slug sama sekali. Kosong/simbol semua
// jatuh balik ke fallback (bukan slug kosong yang ditolak backend).
export function slugifyTitle(title: string, fallback = "halaman"): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallback;
}
