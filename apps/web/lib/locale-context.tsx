"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { dictionaries } from "./i18n/dictionaries";

// Modul Pilihan Bahasa EN/ID (permintaan langsung pengguna, 29 Agustus
// 2026): "pilihan bahasa en/id di navbar". Solusi client-side murni (React
// Context + localStorage, BUKAN next-intl/routing [locale] segment) --
// pendekatan berbasis URL locale butuh me-restrukturisasi SEMUA rute (60+
// halaman) plus middleware/generateStaticParams/redirect jeon.id yang ada
// sekarang, jauh di luar cakupan permintaan ini (cuma toggle bahasa,
// bukan migrasi arsitektur routing). "id" default -- produk ini
// Indonesia-pertama, pengunjung baru tanpa preferensi tersimpan SELALU
// melihat Indonesia dulu.
//
// useSyncExternalStore (BUKAN useState+useEffect) -- lihat catatan lengkap
// soal alasan yang SAMA di theme-context.tsx (aturan react-hooks/set-
// state-in-effect proyek ini).
export type Locale = "id" | "en";

// Dictionary -- bentuk satu locale penuh (id ATAU en), dipakai komponen
// yang butuh akses LANGSUNG ke sub-object/array (mis. daftar fitur paket
// Pricing) -- t() di bawah cuma untuk lookup STRING tunggal lewat path
// bertitik, tidak cocok untuk array/list.
export type Dictionary = typeof dictionaries.id;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
  dict: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "jeonme-locale";

let listeners: Array<() => void> = [];
function notify() {
  listeners.forEach((l) => l());
}
function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((l) => l !== callback);
  };
}
function getSnapshot(): Locale {
  return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "id";
}
function getServerSnapshot(): Locale {
  return "id";
}

// resolveKey -- lookup path bertitik ("nav.features") ke dalam object
// dictionary bersarang. Fallback berlapis (lihat pemakaian di bawah): kunci
// hilang di "en" -> jatuh balik ke "id" -> masih hilang juga -> kembalikan
// key mentah (lebih baik terlihat "hero.title" yang jelas salah ketik
// daripada UI kosong tanpa jejak).
function resolveKey(dict: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.setAttribute("lang", l);
    notify();
  }, []);

  const t = useCallback(
    (key: string) => resolveKey(dictionaries[locale], key) ?? resolveKey(dictionaries.id, key) ?? key,
    [locale]
  );

  return <LocaleContext.Provider value={{ locale, setLocale, t, dict: dictionaries[locale] }}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale dipakai di luar <LocaleProvider>");
  return ctx;
}
