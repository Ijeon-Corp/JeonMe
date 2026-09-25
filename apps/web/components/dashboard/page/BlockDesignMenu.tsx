"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Palette, RotateCcw } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { CUSTOM_FONT_OPTIONS } from "@/lib/page-themes";
import type { BlockStyle, LinkItem } from "@/lib/api-client";

// BlockDesignMenu -- desain per blok (migrasi 000110, permintaan langsung
// pengguna 25 September 2026: "fitur design di tiap blok detail seperti
// warna font background button dll seperti yang ada di menu design jadi
// bisa edit individual", disusul "ukuran font tipe font dll juga").
// Dipasang di BlockToolsStrip -- SATU komponen utk halaman utama & Toko.
//
// Draf lokal langsung diteruskan ke onPreview (pratinjau ikut berubah saat
// pemilih warna digeser), tapi onCommit (PATCH) diberi jeda 400ms --
// <input type="color"> memicu onChange terus-menerus selama digeser.
// block_style disimpan UTUH (whole-replace), {} = kembali ke tema.
const SWATCHES = ["#ffffff", "#111111", "#d7ff60", "#d9ceff", "#ff6448", "#ffafd0", "#8ad5ff", "#5b3fe0"];
const COMMIT_DELAY_MS = 400;

type ColorKey = "bg" | "text" | "button_bg" | "button_text";

function clean(style: BlockStyle): BlockStyle {
  const out: BlockStyle = {};
  for (const [k, v] of Object.entries(style)) if (v) (out as Record<string, string>)[k] = v as string;
  return out;
}

export default function BlockDesignMenu({
  link,
  chipClassName,
  activeClassName,
  idleClassName,
  inline = false,
  onPreview,
  onCommit,
}: {
  link: LinkItem;
  chipClassName: string;
  activeClassName: string;
  idleClassName: string;
  // inline -- tampil sebagai panel biasa (tab "Desain" editor blok, 25
  // September 2026: "daripada menumpuk dibawah style dan design lebih
  // bagus dibuat di tab baru"), tanpa tombol pemicu & popover.
  inline?: boolean;
  onPreview: (style: BlockStyle) => void;
  onCommit: (style: BlockStyle) => void;
}) {
  const { t } = useLocale();
  const T = (key: string) => t(`dashboard.pages.links.linkCard.blockDesign.${key}`);
  const saved = link.block_style ?? {};
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BlockStyle>(saved);
  const [prevSaved, setPrevSaved] = useState(JSON.stringify(saved));
  // dirty -- ada perubahan yang belum terkirim (jeda 400ms berjalan);
  // selama itu draf TIDAK ditimpa nilai tersimpan dari luar.
  const [dirty, setDirty] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<BlockStyle | null>(null);

  // Sinkron draf kalau nilai tersimpan berubah dari luar (rollback, blok
  // lain) -- pola "adjust state during render", bukan useEffect.
  if (JSON.stringify(saved) !== prevSaved) {
    setPrevSaved(JSON.stringify(saved));
    if (!dirty) setDraft(saved);
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

  // Simpan perubahan yang masih tertunda saat komponen dilepas (mis. panel
  // blok ditutup sebelum jeda 400ms habis) supaya tidak hilang.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) onCommit(pendingRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sengaja hanya saat unmount
    [],
  );

  function update(patch: Partial<BlockStyle>) {
    const next = clean({ ...draft, ...patch });
    setDraft(next);
    setDirty(true);
    onPreview(next);
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const toSave = pendingRef.current;
      pendingRef.current = null;
      setDirty(false);
      if (toSave) onCommit(toSave);
    }, COMMIT_DELAY_MS);
  }

  const active = Object.keys(clean(saved)).length > 0;

  function colorRow(key: ColorKey, label: string) {
    const value = draft[key] ?? "";
    return (
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">{label}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => update({ [key]: hex })}
              aria-label={`${label} ${hex}`}
              aria-pressed={value.toLowerCase() === hex}
              className={`h-6 w-6 rounded-full border-2 border-[#111111] transition-transform hover:scale-110 ${
                value.toLowerCase() === hex ? "ring-2 ring-jeon-purple ring-offset-2" : ""
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
          <label
            title={T("customColor")}
            className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-app-border text-[10px] font-bold text-app-muted hover:border-jeon-purple"
          >
            +
            <input
              type="color"
              aria-label={`${label}: ${T("customColor")}`}
              value={value || "#ffffff"}
              onChange={(e) => update({ [key]: e.target.value })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          {value && (
            <button type="button" onClick={() => update({ [key]: "" })} className="ml-1 text-[11px] font-semibold text-app-muted hover:text-app-ink">
              {T("follow")}
            </button>
          )}
        </div>
      </div>
    );
  }

  function segmented<K extends "font_size" | "font_weight" | "align" | "rounded">(key: K, label: string, options: { value: NonNullable<BlockStyle[K]>; label: string }[]) {
    const value = draft[key] ?? "";
    return (
      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-app-muted">{label}</p>
        <div role="group" aria-label={label} className="flex flex-wrap gap-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={value === o.value}
              onClick={() => update({ [key]: value === o.value ? "" : o.value } as Partial<BlockStyle>)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
                value === o.value ? "border-jeon-purple bg-jeon-lavender/60 text-jeon-purple" : "border-app-border text-app-ink hover:bg-app-surface-2"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const panelBody = (
    <>
          <div>
            <p className="text-sm font-bold text-app-ink">{T("title")}</p>
            <p className="text-[11px] text-app-muted">{T("intro")}</p>
          </div>
          {colorRow("bg", T("bg"))}
          {colorRow("text", T("text"))}
          <div>
            <label htmlFor={`bs-font-${link.id}`} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-app-muted">
              {T("font")}
            </label>
            <select
              id={`bs-font-${link.id}`}
              value={draft.font ?? ""}
              onChange={(e) => update({ font: e.target.value })}
              className="w-full rounded-lg border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none"
            >
              <option value="">{T("fontFollow")}</option>
              {CUSTOM_FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value} style={{ fontFamily: f.cssVar }}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          {segmented("font_size", T("fontSize"), [
            { value: "sm", label: T("sizeSm") },
            { value: "base", label: T("sizeBase") },
            { value: "lg", label: T("sizeLg") },
            { value: "xl", label: T("sizeXl") },
          ])}
          {segmented("font_weight", T("weight"), [
            { value: "normal", label: T("weightNormal") },
            { value: "semibold", label: T("weightSemibold") },
            { value: "bold", label: T("weightBold") },
          ])}
          {segmented("align", T("align"), [
            { value: "left", label: T("alignLeft") },
            { value: "center", label: T("alignCenter") },
            { value: "right", label: T("alignRight") },
          ])}
          {colorRow("button_bg", T("buttonBg"))}
          {colorRow("button_text", T("buttonText"))}
          {segmented("rounded", T("rounded"), [
            { value: "none", label: T("roundedNone") },
            { value: "sm", label: T("roundedSm") },
            { value: "md", label: T("roundedMd") },
            { value: "full", label: T("roundedFull") },
          ])}
          {Object.keys(clean(draft)).length > 0 && (
            <button
              type="button"
              onClick={() => update({ bg: "", text: "", font: "", font_size: undefined, font_weight: undefined, align: undefined, button_bg: "", button_text: "", rounded: undefined })}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-app-border px-2.5 py-1.5 text-[11px] font-semibold text-app-ink hover:bg-app-surface-2"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {T("reset")}
            </button>
          )}
    </>
  );

  if (inline) return <div className="flex flex-col gap-3">{panelBody}</div>;

  return (
    <div ref={menuRef} className="sm:relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={T("title")}
        className={`${chipClassName} ${open || active ? activeClassName : idleClassName}`}
      >
        {saved.bg ? (
          <span className="h-4 w-4 flex-shrink-0 rounded-full border border-[#111111]" style={{ backgroundColor: saved.bg }} aria-hidden />
        ) : (
          <Palette className="h-4 w-4 flex-shrink-0" aria-hidden />
        )}
        {T("trigger")}
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 flex max-h-[70vh] flex-col gap-3 overflow-y-auto rounded-xl border border-app-border bg-app-surface p-3 shadow-soft sm:inset-x-auto sm:left-0 sm:w-80">{panelBody}</div>
      )}
    </div>
  );
}
