"use client";

import { useEffect, useRef, useState } from "react";
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, Italic, Palette, RotateCcw } from "lucide-react";
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

const PRESETS = [
  { key: "theme", labelKey: "presetTheme" },
  { key: "dark", labelKey: "presetDark", bg: "#111111", text: "#ffffff", button_bg: "#d7ff60", button_text: "#111111" },
  { key: "light", labelKey: "presetLight", bg: "#ffffff", text: "#111111", button_bg: "#111111", button_text: "#ffffff" },
  { key: "lime", labelKey: "presetLime", bg: "#d7ff60", text: "#111111", button_bg: "#111111", button_text: "#ffffff" },
  { key: "lavender", labelKey: "presetLavender", bg: "#d9ceff", text: "#111111", button_bg: "#111111", button_text: "#ffffff" },
  { key: "pink", labelKey: "presetPink", bg: "#ffafd0", text: "#111111", button_bg: "#111111", button_text: "#ffffff" },
  { key: "sky", labelKey: "presetSky", bg: "#8ad5ff", text: "#111111", button_bg: "#111111", button_text: "#ffffff" },
] as { key: string; labelKey: string; bg?: string; text?: string; button_bg?: string; button_text?: string }[];

const TITLE_ALIGNS = [
  { value: "left", labelKey: "alignLeft", Icon: AlignLeft },
  { value: "center", labelKey: "alignCenter", Icon: AlignCenter },
  { value: "right", labelKey: "alignRight", Icon: AlignRight },
  { value: "justify", labelKey: "alignJustify", Icon: AlignJustify },
] as const;

const TITLE_SIZES = [
  { value: "sm", short: "S" },
  { value: "base", short: "M" },
  { value: "lg", short: "L" },
  { value: "xl", short: "XL" },
] as const;

type ColorKey = "bg" | "text" | "button_bg" | "button_text" | "title_color";

function ToolButton({ label, pressed, onClick, children }: { label: string; pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-bold transition-colors ${
        pressed ? "bg-[#111111] text-white" : "text-app-ink hover:bg-app-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

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
  titleMode,
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
  // titleMode -- bagian "Judul blok" (25 September 2026). "full": judul di
  // atas/bawah konten (posisi & perataan berlaku); "inline": judul sejajar
  // tombol (audio/file) -- cuma ukuran/tebal/miring/warna; undefined:
  // tipe tanpa judul terpisah (tautan, tombol, pembatas, dst).
  titleMode?: "full" | "inline";
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

  function segmented<K extends "font_size" | "font_weight" | "align" | "rounded" | "title_align" | "title_size" | "title_weight" | "title_position">(key: K, label: string, options: { value: NonNullable<BlockStyle[K]>; label: string }[]) {
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

  // Preset "Gaya cepat" -- penyederhanaan 25 September 2026 (pengguna:
  // "ui dan ux nya terlalu sulit dan terlalu ramai untuk pemula"). Satu
  // klik mengatur warna latar/teks/tombol sekaligus; kontrol detail pindah
  // ke "Pengaturan lanjutan" yg terlipat.
  const presetActive = (p: (typeof PRESETS)[number]) =>
    (draft.bg ?? "") === (p.bg ?? "") && (draft.text ?? "") === (p.text ?? "") && (draft.button_bg ?? "") === (p.button_bg ?? "");
  const isLink = link.block_type === "link";

  const panelBody = (
    <>
      <p className="text-[11px] text-app-muted">{T("intro")}</p>

      {/* Gaya cepat -- disembunyikan utk tautan: warna tombol tautan diatur
          lewat "Warna tombol" di atas (latar blok = tombol yg sama). */}
      <section className={isLink ? "hidden" : "flex flex-col gap-2"}>
        <p className="text-sm font-bold text-app-ink">{T("quickStyle")}</p>
        <div role="group" aria-label={T("quickStyle")} className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={presetActive(p)}
              onClick={() => update({ bg: p.bg ?? "", text: p.text ?? "", button_bg: p.button_bg ?? "", button_text: p.button_text ?? "" })}
              className="flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-app-surface-2"
            >
              <span
                className={`flex h-10 w-full items-center justify-center rounded-lg border-2 font-display text-sm font-bold ${
                  presetActive(p) ? "border-jeon-purple ring-2 ring-jeon-purple/30" : "border-app-border"
                } ${p.bg ? "" : "bg-app-surface-2 text-app-ink"}`}
                style={p.bg ? { backgroundColor: p.bg, color: p.text } : undefined}
                aria-hidden
              >
                Aa
              </span>
              <span className="text-[10.5px] font-semibold text-app-ink">{T(p.labelKey)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Judul -- satu baris toolbar ala editor teks. */}
      <section className={titleMode ? "flex flex-col gap-2" : "hidden"}>
        <p className="text-sm font-bold text-app-ink">{T("titleSection")}</p>
        <div role="toolbar" aria-label={T("titleSection")} className="flex flex-wrap items-center gap-1 rounded-lg border border-app-border p-1">
          <div className={titleMode === "full" ? "flex items-center gap-1 border-r border-app-border pr-1" : "hidden"}>
            <ToolButton label={T("posTop")} pressed={draft.title_position === "top"} onClick={() => update({ title_position: draft.title_position === "top" ? undefined : "top" })}>{T("posTopShort")}</ToolButton>
            <ToolButton label={T("posBottom")} pressed={draft.title_position === "bottom"} onClick={() => update({ title_position: draft.title_position === "bottom" ? undefined : "bottom" })}>{T("posBottomShort")}</ToolButton>
          </div>
          <div className={titleMode === "full" ? "flex items-center gap-1 border-r border-app-border pr-1" : "hidden"}>
            {TITLE_ALIGNS.map((a) =>
              <ToolButton key={a.value} label={T(a.labelKey)} pressed={draft.title_align === a.value} onClick={() => update({ title_align: draft.title_align === a.value ? undefined : a.value })}><a.Icon className="h-4 w-4" aria-hidden /></ToolButton>
            )}
          </div>
          <div className="flex items-center gap-1 border-r border-app-border pr-1">
            {TITLE_SIZES.map((sz) =>
              <ToolButton key={sz.value} label={`${T("titleSize")} ${sz.short}`} pressed={draft.title_size === sz.value} onClick={() => update({ title_size: draft.title_size === sz.value ? undefined : sz.value })}>{sz.short}</ToolButton>
            )}
          </div>
          <ToolButton label={T("weightBold")} pressed={draft.title_weight === "bold"} onClick={() => update({ title_weight: draft.title_weight === "bold" ? undefined : "bold" })}><Bold className="h-4 w-4" aria-hidden /></ToolButton>
          <ToolButton label={T("titleItalic")} pressed={Boolean(draft.title_italic)} onClick={() => update({ title_italic: !draft.title_italic })}><Italic className="h-4 w-4" aria-hidden /></ToolButton>
        </div>
      </section>

      {/* Pengaturan lanjutan -- terlipat secara bawaan. */}
      <details className="group rounded-lg border border-app-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-sm font-bold text-app-ink">{T("advanced")}</span>
            <span className="block text-[11px] text-app-muted">{T("advancedHint")}</span>
          </span>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-app-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-3 border-t border-app-border p-3">
          <div className={isLink ? "hidden" : "contents"}>{colorRow("bg", T("bg"))}</div>
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
          <div className={isLink ? "hidden" : "contents"}>
            {colorRow("button_bg", T("buttonBg"))}
            {colorRow("button_text", T("buttonText"))}
          </div>
          {segmented("rounded", T("rounded"), [
            { value: "none", label: T("roundedNone") },
            { value: "sm", label: T("roundedSm") },
            { value: "md", label: T("roundedMd") },
            { value: "full", label: T("roundedFull") },
          ])}
          <div className={titleMode ? "contents" : "hidden"}>{colorRow("title_color", T("titleColor"))}</div>
        </div>
      </details>

      {Object.keys(clean(draft)).length > 0 && (
        <button
          type="button"
          onClick={() =>
            update({
              bg: "",
              text: "",
              font: "",
              font_size: undefined,
              font_weight: undefined,
              align: undefined,
              button_bg: "",
              button_text: "",
              rounded: undefined,
              title_align: undefined,
              title_size: undefined,
              title_weight: undefined,
              title_italic: false,
              title_color: "",
              title_position: undefined,
            })
          }
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
