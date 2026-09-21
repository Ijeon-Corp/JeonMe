"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

// Modul Dark/Light Mode (permintaan langsung pengguna, 29 Agustus 2026).
//
// DEFAULT = LIGHT (permintaan langsung pengguna, 22 September 2026: "by
// default pengguna saat akses itu light theme"). SEBELUMNYA pengguna yang
// belum pernah menekan toggle mengikuti setelan gelap/terang perangkatnya
// ("system", lewat @media prefers-color-scheme) -- sekarang pengguna baru
// SELALU mulai terang, apa pun setelan OS-nya. Hanya pilihan "dark" yang
// pernah DISIMPAN pengguna sendiri lewat toggle (localStorage) yang
// menghasilkan tema gelap. Opsi "system" dihapus: tidak ada UI yang
// pernah memakainya selain sebagai keadaan bawaan.
//
// useSyncExternalStore (BUKAN useState+useEffect) -- aturan proyek ini
// (react-hooks/set-state-in-effect, lihat CLAUDE.md) melarang setState
// langsung di badan efek; localStorage adalah SUMBER EKSTERNAL
// klasik yang React sendiri sediakan hook khusus untuknya. Bonus:
// getServerSnapshot terpisah dari getSnapshot menangani celah SSR/hidrasi
// (server tidak kenal localStorage) TANPA kedipan render ganda manual.
type ThemePreference = "light" | "dark";

interface ThemeContextValue {
  effectiveTheme: ThemePreference;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "jeonme-theme";

let listeners: Array<() => void> = [];
function notify() {
  listeners.forEach((l) => l());
}

// subscribe -- dipicu notify() dari toggle (klik manual). Tidak lagi
// mendengarkan perubahan preferensi OS (matchMedia): default terang tidak
// bergantung pada setelan perangkat.
function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
}
function getPreferenceServerSnapshot(): ThemePreference {
  return "light";
}

function applyDomTheme(preference: ThemePreference) {
  document.documentElement.setAttribute("data-theme", preference);
}

// ThemeProvider -- dipasang SEKALI di root layout (app/layout.tsx), jadi
// state dark/light konsisten di seluruh aplikasi (situs pemasaran MAUPUN
// dashboard), bukan per-halaman. Skrip anti-kedip (lihat THEME_INIT_SCRIPT
// di bawah, ditaruh di <head> lewat layout.tsx) sudah men-set atribut
// data-theme di DOM SEBELUM React hydrate -- itulah yang mencegah kedipan
// WARNA (CSS var app-* langsung ikut atribut itu). effectiveTheme React di
// sini murni dipakai UI seperti ikon ThemeToggle, boleh sedikit "menyusul"
// sesaat setelah hidrasi (perilaku baku useSyncExternalStore), TIDAK
// berdampak ke warna yang sudah benar dari awal.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const effectiveTheme = useSyncExternalStore(subscribe, getPreferenceSnapshot, getPreferenceServerSnapshot);

  const toggle = useCallback(() => {
    const next: ThemePreference = effectiveTheme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    applyDomTheme(next);
    notify();
  }, [effectiveTheme]);

  return <ThemeContext.Provider value={{ effectiveTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme dipakai di luar <ThemeProvider>");
  return ctx;
}

// THEME_INIT_SCRIPT -- string mentah (BUKAN komponen React) yang disuntik
// lewat <script dangerouslySetInnerHTML> di app/layout.tsx, SEBELUM <body>
// dirender -- pola standar "no-flash dark mode": baca localStorage lalu
// set atribut data-theme di <html> SEBELUM cat pertama browser, supaya
// tidak ada kedipan tema salah sesaat sebelum React/hook di atas sempat
// jalan.
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var pref = localStorage.getItem("${STORAGE_KEY}");
    document.documentElement.setAttribute("data-theme", pref === "dark" ? "dark" : "light");
  } catch (e) {}
})();
`;
