"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

// Modul Dark/Light Mode (permintaan langsung pengguna, 29 Agustus 2026).
// resolvedTheme -- "system" TIDAK PERNAH jadi nilai efektif yang dirender
// (cuma preferensi tersimpan) -- lihat effectiveTheme di bawah untuk nilai
// SUNGGUHAN yang dipakai UI (mis. ikon toggle harus tahu ini "light" atau
// "dark", bukan "system").
//
// useSyncExternalStore (BUKAN useState+useEffect) -- aturan proyek ini
// (react-hooks/set-state-in-effect, lihat CLAUDE.md) melarang setState
// langsung di badan efek; localStorage/matchMedia adalah SUMBER EKSTERNAL
// klasik yang React sendiri sediakan hook khusus untuknya. Bonus:
// getServerSnapshot terpisah dari getSnapshot menangani celah SSR/hidrasi
// (server tidak kenal localStorage) TANPA kedipan render ganda manual.
type ThemePreference = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "jeonme-theme";

let listeners: Array<() => void> = [];
function notify() {
  listeners.forEach((l) => l());
}

// subscribe -- SATU fungsi dipakai KEDUA useSyncExternalStore di bawah
// (preference & effectiveTheme) -- keduanya perlu re-render dipicu oleh hal
// yang SAMA: toggle manual (notify() lewat setPreference) MAUPUN perubahan
// preferensi OS (event "change" matchMedia, relevan waktu preferensi
// tersimpan masih "system").
function subscribe(callback: () => void) {
  listeners.push(callback);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
    mq.removeEventListener("change", callback);
  };
}

function getPreferenceSnapshot(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}
function getPreferenceServerSnapshot(): ThemePreference {
  return "system";
}

function getEffectiveSnapshot(): EffectiveTheme {
  const pref = getPreferenceSnapshot();
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function getEffectiveServerSnapshot(): EffectiveTheme {
  return "light";
}

function applyDomTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", preference);
  }
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
  const preference = useSyncExternalStore(subscribe, getPreferenceSnapshot, getPreferenceServerSnapshot);
  const effectiveTheme = useSyncExternalStore(subscribe, getEffectiveSnapshot, getEffectiveServerSnapshot);

  const setPreference = useCallback((p: ThemePreference) => {
    if (p === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, p);
    }
    applyDomTheme(p);
    notify();
  }, []);

  const toggle = useCallback(() => {
    setPreference(effectiveTheme === "dark" ? "light" : "dark");
  }, [effectiveTheme, setPreference]);

  return <ThemeContext.Provider value={{ preference, effectiveTheme, setPreference, toggle }}>{children}</ThemeContext.Provider>;
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
    if (pref === "light" || pref === "dark") {
      document.documentElement.setAttribute("data-theme", pref);
    }
  } catch (e) {}
})();
`;
