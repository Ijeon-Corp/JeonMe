// product-categories.ts -- diekstrak dari CreateProductForm.tsx (permintaan
// langsung pengguna, 15 September 2026: "harusnya category jangan optional
// dan kalo bisa sediakan beberapa category yang umum untuk dipilih") supaya
// SATU sumber kebenaran dipakai bersama oleh form pembuatan produk
// (CreateProductForm.tsx, cuma daftar nama) DAN form pembelian
// (BuyProductButton.tsx, susulan langsung: "harusnya untuk tiap kategori
// ada instruksi cara pembelian sampai barang diterima atau jasa dll") --
// tanpa ini, kalau nama kategori preset berubah di satu tempat, instruksi
// pembeli di tempat lain diam-diam tidak pernah cocok lagi.
//
// Kategori CUSTOM bikinan kreator sendiri (opsi "+ Kategori baru",
// CreateProductForm.tsx) SENGAJA tidak masuk daftar ini -- nilainya bebas
// teks, tidak mungkin diberi instruksi baku yang akurat. CATEGORY_INSTRUCTIONS
// jatuh balik ke DEFAULT_CATEGORY_INSTRUCTION untuk kategori mana pun yang
// tidak ada di peta ini (termasuk kategori custom DAN "Lainnya" itu sendiri).
export const PRESET_CATEGORIES = [
  "E-book",
  "Kursus Online",
  "Template & Desain",
  "Preset & Filter",
  "Musik & Audio",
  "Video",
  "Software & Aplikasi",
  "Jasa & Konsultasi",
  "Lainnya",
];

// DIGITAL_FILE_INSTRUCTION -- kategori file digital yang polanya SAMA PERSIS
// (unduhan otomatis lewat email begitu lunas, lihat CheckoutHandler.DownloadFile
// & queue.TypeOrderPaidNotification) -- satu string dibagi bersama supaya
// tidak ada 6 salinan teks nyaris identik yang bisa saling berbeda tanpa
// sengaja.
const DIGITAL_FILE_INSTRUCTION = "Setelah pembayaran berhasil, kamu akan langsung menerima link unduhan file lewat email -- tidak perlu menunggu penjual.";

export const CATEGORY_INSTRUCTIONS: Record<string, string> = {
  "E-book": DIGITAL_FILE_INSTRUCTION,
  "Template & Desain": DIGITAL_FILE_INSTRUCTION,
  "Preset & Filter": DIGITAL_FILE_INSTRUCTION,
  "Musik & Audio": DIGITAL_FILE_INSTRUCTION,
  Video: DIGITAL_FILE_INSTRUCTION,
  "Software & Aplikasi": DIGITAL_FILE_INSTRUCTION,
  "Kursus Online": "Setelah pembayaran berhasil, kamu langsung bisa mengakses seluruh materi kursus lewat halaman status pesanan (link juga dikirim ke email).",
  "Jasa & Konsultasi": "Setelah pembayaran berhasil, penjual akan menghubungimu langsung lewat email atau nomor WhatsApp yang kamu isi untuk mengatur jadwal & detail layanan.",
};

// DEFAULT_CATEGORY_INSTRUCTION -- dipakai utk "Lainnya" & kategori custom
// apa pun yang tidak ada di CATEGORY_INSTRUCTIONS di atas -- generik tapi
// tetap jelas soal langkah berikutnya, bukan dibiarkan tanpa instruksi
// sama sekali.
export const DEFAULT_CATEGORY_INSTRUCTION =
  "Setelah pembayaran berhasil, kamu akan menerima instruksi & tautan pesananmu lewat email.";

export function getCategoryInstruction(category?: string): string {
  if (!category) return DEFAULT_CATEGORY_INSTRUCTION;
  return CATEGORY_INSTRUCTIONS[category] ?? DEFAULT_CATEGORY_INSTRUCTION;
}
