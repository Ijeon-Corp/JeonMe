// Helper alur OAuth Instagram/TikTok -- Modul Koneksi Sosial, permintaan
// langsung pengguna, 17 Agustus 2026: "saya mau jeonme ini bisa connect ke
// akun kita contoh nya instagram tiktok". Pola SAMA PERSIS dengan
// lib/google-oauth.ts (state acak di sessionStorage sebagai proteksi CSRF,
// redirect_uri dihitung dari origin browser saat ini) -- dipakai bersama
// oleh SocialConnectButtons (dashboard, memulai redirect) dan
// app/auth/{instagram,tiktok}/callback/page.tsx (menukar code).
const OAUTH_STATE_STORAGE_KEY_PREFIX = "jeonme_social_oauth_state_";

export type SocialPlatform = "instagram" | "tiktok";

export function socialRedirectUri(platform: SocialPlatform): string {
  return `${window.location.origin}/auth/${platform}/callback`;
}

function consumeState(platform: SocialPlatform): string | null {
  const key = OAUTH_STATE_STORAGE_KEY_PREFIX + platform;
  const state = window.sessionStorage.getItem(key);
  window.sessionStorage.removeItem(key);
  return state;
}

function storeState(platform: SocialPlatform, state: string) {
  window.sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY_PREFIX + platform, state);
}

// buildInstagramAuthUrl -- scope instagram_business_basic (baca profil +
// media SAJA -- Jeonme tidak pernah memposting apa pun atas nama kreator).
// Akun Instagram kreator WAJIB Professional (Creator/Business), sama
// seperti persyaratan Linktree yang diriset sebelum fitur ini dibangun.
export function buildInstagramAuthUrl(appId: string): string {
  const state = crypto.randomUUID();
  storeState("instagram", state);
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: socialRedirectUri("instagram"),
    response_type: "code",
    scope: "instagram_business_basic",
    state,
  });
  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
}

export function consumeInstagramOAuthState(): string | null {
  return consumeState("instagram");
}

// buildTikTokAuthUrl -- scope user.info.basic + video.list (baca profil +
// daftar video SAJA). TikTok mewajibkan client_key ditampilkan di URL
// (bukan rahasia seperti client_secret) -- pola identik dengan client_id
// Google/Instagram di atas.
export function buildTikTokAuthUrl(clientKey: string): string {
  const state = crypto.randomUUID();
  storeState("tiktok", state);
  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.list",
    redirect_uri: socialRedirectUri("tiktok"),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export function consumeTikTokOAuthState(): string | null {
  return consumeState("tiktok");
}
