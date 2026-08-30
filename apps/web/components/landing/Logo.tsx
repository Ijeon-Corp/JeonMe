// Wordmark jeon.id -- Redesign "Modern Playful Creator Platform"
// (DESIGN-JEONID-REDESIGN.md §9, Fase 2): wordmark TEKS huruf kecil
// "jeon.id" + simbol sparkle sederhana, menggantikan logo.png (wordmark
// hijau lama yang tidak cocok dengan identitas ungu baru). Aturan spec:
// penulisan WAJIB "jeon.id" huruf kecil (bukan "Jeon.id"/"JEON.ID");
// latar terang = teks ink + aksen ungu, latar gelap = teks putih +
// aksen lime/ungu -- text-jeon-ink sudah otomatis flip ikut dark mode,
// sparkle tetap ungu di kedua mode (warna brand konstan).
//
// Ekspor & prop className dipertahankan persis seperti Logo lama supaya
// semua pemakainya (Navbar/Footer/dll) tidak perlu berubah.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1 font-display text-2xl font-extrabold tracking-tight text-jeon-ink ${className}`}>
      <span aria-hidden="true" className="text-jeon-purple">
        ✦
      </span>
      jeon.id
    </span>
  );
}
