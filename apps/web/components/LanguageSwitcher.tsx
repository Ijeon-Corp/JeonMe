"use client";

import { useLocale } from "@/lib/locale-context";

// LanguageSwitcher -- Modul Pilihan Bahasa EN/ID (permintaan langsung
// pengguna, 29 Agustus 2026): dua tombol pil ID/EN (BUKAN dropdown) --
// cuma 2 pilihan, pil langsung terlihat lebih cepat diklik daripada buka
// menu dulu. className dioper dari pemanggil (lihat catatan sama di
// ThemeToggle.tsx).
export default function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={className ?? "flex items-center gap-0.5 rounded-full border border-app-border p-0.5 text-xs font-bold"}>
      {(["id", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`rounded-full px-2 py-1 uppercase transition-colors ${
            locale === l ? "btn-primary text-white" : "text-app-muted hover:text-app-ink"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
