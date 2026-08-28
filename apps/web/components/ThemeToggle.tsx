"use client";

import { useTheme } from "@/lib/theme-context";
import { useLocale } from "@/lib/locale-context";
import { IconMoon, IconSun } from "@/components/icons";

// ThemeToggle -- Modul Dark/Light Mode (permintaan langsung pengguna, 29
// Agustus 2026): satu tombol bulat, ikon SELALU menunjukkan tema TUJUAN
// (bukan tema aktif) -- pola umum toggle switch, mis. ikon bulan tampil
// saat SEDANG terang (klik untuk KE gelap). className dioper dari
// pemanggil (Navbar pemasaran vs shell dashboard butuh warna/ukuran beda)
// -- komponen ini sengaja tidak mengunci gaya visualnya sendiri.
export default function ThemeToggle({ className }: { className?: string }) {
  const { effectiveTheme, toggle } = useTheme();
  const { t } = useLocale();
  const isDark = effectiveTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t("themeToggle.light") : t("themeToggle.dark")}
      title={isDark ? t("themeToggle.light") : t("themeToggle.dark")}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface-2 hover:text-app-ink"
      }
    >
      {isDark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
    </button>
  );
}
