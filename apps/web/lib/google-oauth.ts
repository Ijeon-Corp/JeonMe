// Helper alur OAuth Google Authorization Code -- permintaan langsung
// pengguna, 13 Agustus 2026: "tambahkan di login dan register login via
// google". Dipakai BERSAMA oleh GoogleAuthButton.tsx (memulai redirect) dan
// app/auth/google/callback/page.tsx (menukar code) -- fungsi redirect URI
// SENGAJA satu sumber kebenaran yang sama supaya keduanya tidak mungkin
// mencong: Google menolak token exchange kalau redirect_uri di permintaan
// akhir tidak cocok byte-per-byte dengan yang dipakai di permintaan awal.
const OAUTH_STATE_STORAGE_KEY = "jeonme_google_oauth_state";

// googleRedirectUri -- origin diambil dari browser saat ini (bukan
// hardcode), otomatis benar baik di localhost:3000 (dev) maupun
// jeon.id (production) dari satu build yang sama -- KEDUANYA harus
// didaftarkan persis sebagai Authorized redirect URI di Google Cloud
// Console (lihat apps/api/.env.example).
export function googleRedirectUri(): string {
  return `${window.location.origin}/auth/google/callback`;
}

// buildGoogleAuthUrl -- state acak disimpan di sessionStorage (bukan
// localStorage -- cuma perlu bertahan selama round-trip redirect ini, tidak
// perlu lintas tab/sesi) sebagai proteksi CSRF standar alur Authorization
// Code: halaman callback WAJIB mencocokkan state yang Google kembalikan
// dengan nilai ini sebelum menukar code apa pun (lihat consumeGoogleOAuthState).
export function buildGoogleAuthUrl(clientId: string): string {
  const state = crypto.randomUUID();
  window.sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// consumeGoogleOAuthState -- "consume" (bukan cuma "get") karena state
// sekali pakai: dibaca SEKALIGUS dihapus supaya halaman callback yang
// ter-reload/dibuka lagi tidak bisa mencoba menukar code basi dengan state
// lama yang masih tersimpan.
export function consumeGoogleOAuthState(): string | null {
  const state = window.sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  return state;
}
