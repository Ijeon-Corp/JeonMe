"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, PaintBucket, X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import type { LinkItem } from "@/lib/api-client";

// ButtonStyleMenu -- warna tombol & label harga per tautan (migrasi 000109,
// layout "Profil Kreator", permintaan langsung pengguna 24 September 2026:
// tombol lime/lavender/coral/biru & chip "Mulai Rp3jt"/"Gratis" di gambar
// referensi). Dipasang di BlockToolsStrip -- SATU komponen utk halaman
// utama & Toko (paritas). Swatch = palet brand jeon.id (globals.css
// --jeon-*), plus pemilih warna bebas & "Ikuti tema" (kosongkan warna).
// Label harga disimpan saat blur/Enter (bukan per ketikan) supaya tidak
// membanjiri PATCH.
const SWATCHES = ["#d7ff60", "#d9ceff", "#ff6448", "#ffafd0", "#8ad5ff", "#7657ff", "#111111"];

export type ButtonStylePatch = { accent_color?: string; badge_text?: string };

export default function ButtonStyleMenu({
  link,
  chipClassName,
  activeClassName,
  idleClassName,
  onChange,
}: {
  link: LinkItem;
  chipClassName: string;
  activeClassName: string;
  idleClassName: string;
  onChange: (patch: ButtonStylePatch) => void;
}) {
  const { t } = useLocale();
  const T = (key: string) => t(`dashboard.pages.links.linkCard.buttonStyle.${key}`);
  const [open, setOpen] = useState(false);
  const [badgeDraft, setBadgeDraft] = useState(link.badge_text ?? "");
  const [prevBadge, setPrevBadge] = useState(link.badge_text ?? "");
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sinkron draft label kalau nilai tersimpan berubah dari luar (mis.
  // rollback) -- pola "adjust state during render".
  if ((link.badge_text ?? "") !== prevBadge) {
    setPrevBadge(link.badge_text ?? "");
    setBadgeDraft(link.badge_text ?? "");
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function commitBadge() {
    const next = badgeDraft.trim();
    if (next !== (link.badge_text ?? "")) onChange({ badge_text: next });
  }

  const active = Boolean(link.accent_color || link.badge_text);

  return (
    <div ref={menuRef} className="sm:relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={T("trigger")}
        className={`${chipClassName} ${open || active ? activeClassName : idleClassName}`}
      >
        {link.accent_color ? (
          <span className="h-4 w-4 flex-shrink-0 rounded-full border border-[#111111]" style={{ backgroundColor: link.accent_color }} aria-hidden />
        ) : (
          <PaintBucket className="h-4 w-4 flex-shrink-0" aria-hidden />
        )}
        {T("trigger")}
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 flex flex-col gap-3 rounded-xl border border-app-border bg-app-surface p-3 shadow-soft sm:inset-x-auto sm:left-0 sm:w-72">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">{T("colorLabel")}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {SWATCHES.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange({ accent_color: hex })}
                  aria-label={`${T("colorLabel")} ${hex}`}
                  aria-pressed={link.accent_color?.toLowerCase() === hex}
                  className={`h-7 w-7 rounded-full border-2 border-[#111111] transition-transform hover:scale-110 ${
                    link.accent_color?.toLowerCase() === hex ? "ring-2 ring-jeon-purple ring-offset-2" : ""
                  }`}
                  style={{ backgroundColor: hex }}
                />
              ))}
              <label
                title={T("customColor")}
                className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-app-border text-[10px] font-bold text-app-muted hover:border-jeon-purple"
              >
                +
                <input
                  type="color"
                  aria-label={T("customColor")}
                  value={link.accent_color || "#d7ff60"}
                  onChange={(e) => onChange({ accent_color: e.target.value })}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
            </div>
            {link.accent_color && (
              <button
                type="button"
                onClick={() => onChange({ accent_color: "" })}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-app-muted hover:text-app-ink"
              >
                <X className="h-3 w-3" aria-hidden />
                {T("followTheme")}
              </button>
            )}
          </div>
          <div>
            <label htmlFor={`badge-${link.id}`} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-app-muted">
              {T("badgeLabel")}
            </label>
            <input
              id={`badge-${link.id}`}
              type="text"
              maxLength={24}
              value={badgeDraft}
              placeholder={T("badgePlaceholder")}
              onChange={(e) => setBadgeDraft(e.target.value)}
              onBlur={commitBadge}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitBadge();
                }
              }}
              className="w-full rounded-lg border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            />
            <p className="mt-1 text-[10.5px] text-app-muted">{T("badgeHelp")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
