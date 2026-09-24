// normalizeWhatsappNumber/buildWhatsappButtonUrl -- blok "Tombol" mode
// WhatsApp: URL wa.me dibangun dari nomor+pesan lalu disimpan APA ADANYA di
// kolom `url` blok (satu-satunya sumber kebenaran tujuan klik, dipakai ulang
// oleh seluruh mekanisme render/lock/tracking yang sudah ada) --
// whatsapp_number/whatsapp_message TETAP disimpan terpisah di block_data
// HANYA supaya kreator bisa membuka & mengedit nomor/pesannya lagi nanti
// tanpa perlu mem-parse balik dari URL.
//
// Audit 24 September 2026 (P4): SEBELUMNYA disalin terpisah di
// dashboard/links/page.tsx DAN ProdukPageEditor.tsx (Toko) -- dua salinan
// yang sudah mulai beda gaya penulisan. Satu modul supaya halaman utama &
// Toko pasti menghasilkan URL yang sama.
export function normalizeWhatsappNumber(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
}

export function buildWhatsappButtonUrl(number: string, message: string): string {
  const normalized = normalizeWhatsappNumber(number);
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${normalized}${query}`;
}
