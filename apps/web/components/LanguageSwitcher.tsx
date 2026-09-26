"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

// LanguageSwitcher -- Modul Pilihan Bahasa EN/ID (29 Agustus 2026).
// SEBELUMNYA dua tombol pil ID/EN; diubah jadi DROPDOWN di semua navbar
// (permintaan langsung pengguna, 26 September 2026: "ubah pilihan bahasa
// jadi dropdown di semua navbar").
//
// Menu dirender lewat portal dgn posisi `fixed` (bukan absolute di dalam
// induk): salah satu pemakainya ada DI DALAM menu akun dashboard yang
// ber-overflow-hidden -- menu absolut biasa akan terpotong di sana. Membuka
// ke atas kalau ruang di bawah tombol tidak cukup.
//
// className = pembungkus (visibilitas/tata letak dari pemanggil, mis.
// "hidden lg:block"); triggerClassName = gaya tombol agar serasi dgn
// kontrol di sebelahnya (ThemeToggle di tiap navbar).
const LANGUAGES = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "en", label: "English" },
] as const;

const MENU_WIDTH = 200;

export default function LanguageSwitcher({
  className,
  triggerClassName = "flex h-9 items-center gap-1 rounded-full border border-app-border px-2.5 text-xs font-bold text-app-ink transition-colors hover:border-jeon-purple hover:text-jeon-purple",
}: {
  className?: string;
  triggerClassName?: string;
}) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const menuHeight = LANGUAGES.length * 40 + 12;
    const below = window.innerHeight - r.bottom >= menuHeight + 8;
    const left = Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPos({ top: below ? r.bottom + 6 : r.top - menuHeight - 6, left });
  }

  function toggle() {
    if (!open) place();
    setOpen((o) => !o);
  }

  function choose(code: "id" | "en") {
    setLocale(code);
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    // Fokus ke pilihan aktif saat menu terbuka (navigasi keyboard).
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus();
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
        const idx = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }
    function close() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("languageSwitcher.label")}
        title={t("languageSwitcher.label")}
        className={triggerClassName}
      >
        <Globe className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
        <span className="uppercase">{locale}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            data-floating-menu
            aria-label={t("languageSwitcher.label")}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-[80] overflow-hidden rounded-jmd border border-app-border bg-app-surface p-1.5 shadow-soft"
          >
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="option"
                aria-selected={locale === l.code}
                onClick={() => choose(l.code)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-app-surface-2 focus:bg-app-surface-2 focus:outline-none ${
                  locale === l.code ? "font-bold text-app-ink" : "text-app-muted"
                }`}
              >
                <span>{l.label}</span>
                {locale === l.code && <Check className="h-4 w-4 flex-shrink-0 text-jeon-purple" aria-hidden />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
