// Helper alur "Sign in with Apple" -- permintaan langsung pengguna, 20
// Agustus 2026: "tambahkan juga login via apple" (susulan login via
// Google, lib/google-oauth.ts -- pola SAMA PERSIS, storage key state CSRF
// beda supaya tidak pernah bentrok kalau entah bagaimana kedua alur
// kepencet nyaris bersamaan). Dipakai BERSAMA oleh AppleAuthButton.tsx
// (memulai redirect) dan app/auth/apple/callback/page.tsx (menukar code).
const OAUTH_STATE_STORAGE_KEY = "jeonme_apple_oauth_state";

// appleRedirectUri -- HARUS didaftarkan PERSIS sebagai salah satu "Return
// URLs" di Apple Developer (Services ID > Sign in with Apple > Configure) --
// lihat catatan lengkap di apps/api/.env.example. Apple TIDAK mengizinkan
// localhost/http:// di sana (beda dari Google), jadi alur ini praktis
// cuma bisa dites dari staging/production, tidak dari `npm run dev` lokal.
export function appleRedirectUri(): string {
  return `${window.location.origin}/auth/apple/callback`;
}

// buildAppleAuthUrl -- response_mode SENGAJA "query" (bukan "form_post")
// & scope SENGAJA TIDAK diminta sama sekali -- lihat catatan lengkap di
// internal/appleoauth/client.go (package Go) kenapa: form_post cuma wajib
// kalau scope diminta, app ini tidak pernah pakai nama dari Apple (konsisten
// dengan Google yang juga tidak menyimpan profile.Name), jadi callback bisa
// tetap GET query string sederhana sama seperti Google -- SATU pola
// callback page yang sama, bukan endpoint terpisah utk menangani POST form.
export function buildAppleAuthUrl(clientId: string): string {
  const state = crypto.randomUUID();
  window.sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: appleRedirectUri(),
    response_type: "code",
    response_mode: "query",
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

// consumeAppleOAuthState -- "consume" (bukan cuma "get"), pola sama persis
// dengan consumeGoogleOAuthState: dibaca SEKALIGUS dihapus supaya halaman
// callback yang ter-reload/dibuka lagi tidak bisa menukar code basi dengan
// state lama yang masih tersimpan.
export function consumeAppleOAuthState(): string | null {
  const state = window.sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
  return state;
}
