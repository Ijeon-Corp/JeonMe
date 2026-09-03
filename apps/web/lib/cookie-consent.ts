// Persetujuan cookie per kategori -- benchmark Linktree "More > Cookie
// Preferences" (permintaan pengguna, 3 September 2026). SEBELUMNYA Meta
// Pixel & GA (AnalyticsScripts) dimuat ke SEMUA pengunjung halaman kreator
// tanpa persetujuan, dan tautan "Preferensi Cookie" di footer hanya membuka
// teks. Sekarang: pilihan disimpan di localStorage (satu untuk seluruh
// jeon.id, seperti Linktree), AnalyticsScripts hanya memuat skrip yang
// kategorinya disetujui, dan footer membuka pengaturannya.
//
// Kategori mengikuti apa yang SUNGGUHAN ada di kode: "necessary" (sesi
// login & preferensi tampilan -- selalu aktif), "analytics" (Google
// Analytics milik kreator), "marketing" (Meta Pixel milik kreator).
export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
  version: 1;
}

const KEY = "jeon_cookie_consent";
const CHANGE_EVENT = "jeon-cookie-consent-change";
const OPEN_EVENT = "jeon-cookie-preferences-open";

export function readCookieConsent(): CookieConsent | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CookieConsent>;
    if (v.version !== 1) return null;
    return { necessary: true, analytics: !!v.analytics, marketing: !!v.marketing, updatedAt: String(v.updatedAt ?? ""), version: 1 };
  } catch {
    return null;
  }
}

export function writeCookieConsent(choice: { analytics: boolean; marketing: boolean }): CookieConsent {
  const consent: CookieConsent = { necessary: true, ...choice, updatedAt: new Date().toISOString(), version: 1 };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    /* mode privat / storage diblokir: pilihan berlaku untuk sesi ini saja */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: consent }));
  return consent;
}

export function onCookieConsentChange(listener: (c: CookieConsent) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<CookieConsent>).detail);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// openCookiePreferences -- dipanggil tautan footer; CookieConsent (kalau
// terpasang di halaman) membuka modalnya. Mengembalikan false kalau tidak
// ada yang mendengarkan, supaya pemanggil bisa jatuh ke tampilan lama.
export function openCookiePreferences(): boolean {
  if (typeof window === "undefined" || !window.__jeonCookieConsentMounted) return false;
  window.dispatchEvent(new Event(OPEN_EVENT));
  return true;
}

export function onOpenCookiePreferences(listener: () => void): () => void {
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

declare global {
  interface Window {
    __jeonCookieConsentMounted?: boolean;
  }
}
