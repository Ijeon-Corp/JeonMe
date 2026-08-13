"use client";

import { buildGoogleAuthUrl } from "@/lib/google-oauth";

// Logo resmi Google "G" 4 warna -- SENGAJA inline SVG multi-warna di sini
// (bukan ditambahkan ke components/icons.tsx yang isinya satu keluarga
// ikon garis satu-warna, lihat catatan di file itu) karena pedoman brand
// Google mewajibkan logo G asli & warnanya tetap utuh untuk tombol "Sign
// in with Google", tidak boleh di-restyle jadi currentColor seperti ikon
// lain di app ini.
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4 flex-shrink-0" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5C41.5 36.1 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

// GoogleAuthButton -- permintaan langsung pengguna, 13 Agustus 2026:
// "tambahkan di login dan register login via google". Dipakai SATU
// komponen yang sama di /login DAN /register (label saja yang beda) --
// backend juga satu endpoint yang sama (AuthHandler.GoogleLogin) yang
// melayani login MAUPUN register sekaligus, jadi tombolnya pun tidak
// perlu berbeda perilaku. Alur Authorization Code PENUH (bukan Google
// Identity Services popup/id_token) -- klik langsung redirect penuh
// browser ke accounts.google.com, TIDAK ada script Google yang dimuat di
// halaman ini sama sekali.
//
// onBeforeRedirect -- dipakai /register untuk menegakkan checkbox
// persetujuan data pribadi (NF-09, UU PDP) SEBELUM redirect terjadi,
// pola validasi-saat-aksi yang sama seperti tombol submit form password
// di halaman yang sama (bukan menonaktifkan tombol, lihat RegisterPage).
// Kembalikan false untuk membatalkan redirect.
export default function GoogleAuthButton({
  label,
  onBeforeRedirect,
}: {
  label: string;
  onBeforeRedirect?: () => boolean;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Tidak dirender sama sekali kalau belum dikonfigurasi (pola soft-fail
  // yang sama seperti fitur lain yang butuh kredensial eksternal opsional
  // di proyek ini, mis. Midtrans/S3/WhatsApp) -- daripada tombol aktif yang
  // pasti gagal begitu diklik.
  if (!clientId) return null;

  function handleClick() {
    if (onBeforeRedirect && !onBeforeRedirect()) return;
    window.location.href = buildGoogleAuthUrl(clientId!);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-white px-5 py-3.5 text-sm font-bold text-ink shadow-sm transition-colors hover:bg-black/[0.02]"
    >
      <GoogleGIcon />
      {label}
    </button>
  );
}
