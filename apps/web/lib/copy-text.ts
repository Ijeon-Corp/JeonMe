// copyText -- penyalinan ke clipboard yang TIDAK pernah gagal diam-diam.
// Dibuat 24 September 2026 dari temuan audit kualitas kode.
//
// Temuannya: 7 tombol "Salin" (tautan halaman di top bar & beranda, tautan
// afiliasi, secret webhook, kode voucher lead capture, tautan kartu nama,
// UTM builder) memanggil `navigator.clipboard.writeText(x).then(...)` TANPA
// .catch. writeText MENOLAK kalau dokumen sedang tidak fokus (mis. baru
// kembali dari tab lain, devtools terfokus) atau izin clipboard ditolak --
// dan saat itu terjadi, tanda "Tersalin" tidak muncul, tidak ada error, dan
// clipboard memang tidak terisi. Pengguna menempel isi lama tanpa sadar.
// Dua di antaranya juga tanpa optional chaining, jadi di konteks non-secure
// (http, tanpa navigator.clipboard sama sekali) malah melempar TypeError.
//
// Urutan upaya:
//  1. Clipboard API modern.
//  2. Fallback lama textarea + execCommand("copy") -- tetap bekerja di
//     konteks non-secure dan di beberapa kasus fokus yang ditolak API modern.
//  3. Upaya terakhir: tampilkan teksnya lewat window.prompt supaya pengguna
//     bisa menyalin manual. Tidak cantik, tapi jujur -- jauh lebih baik
//     daripada tombol yang diam-diam tidak melakukan apa pun.
//
// Mengembalikan true HANYA kalau teks benar-benar tersalin otomatis, jadi
// pemanggil hanya menampilkan "Tersalin" saat memang tersalin.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // lanjut ke fallback di bawah
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) return true;
  } catch {
    // lanjut ke upaya terakhir
  }
  window.prompt("Salin teks ini:", text);
  return false;
}
