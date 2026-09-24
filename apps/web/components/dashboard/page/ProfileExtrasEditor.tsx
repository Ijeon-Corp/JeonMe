"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ApiError, ProfileExtras } from "@/lib/api-client";
import { getLibraryIcon, libraryIconColor } from "@/lib/icon-library";
import { IconPlus, IconTrash } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

const IconPickerModal = dynamic(() => import("@/components/IconPickerModal"));

// ProfileExtrasEditor -- editor chip keahlian & baris statistik layout
// "Profil Kreator" (migrasi 000109, permintaan langsung pengguna 24
// September 2026). SATU komponen dipakai halaman utama (Desain > Header)
// DAN Toko (HeaderSection, design-sections.tsx) -- aturan paritas di
// CLAUDE.md, supaya dua jalur editor tidak bisa melenceng.
//
// Draft lokal + tombol Simpan eksplisit (bukan simpan per ketikan):
// backend mengganti profile_extras UTUH tiap simpan (pola stiker), dan
// validasinya (label wajib, batas panjang) lebih masuk akal dinilai sekali
// pada daftar lengkap. `_key` klien menjaga key React stabil saat baris
// dihapus/ditambah, dibuang sebelum dikirim.
const MAX_CHIPS = 5;
const MAX_STATS = 3;

type DraftChip = { _key: string; label: string; icon: string };
type DraftStat = { _key: string; value: string; label: string };

function toDraft(value: ProfileExtras) {
  return {
    chips: (value.chips ?? []).map((c) => ({ _key: crypto.randomUUID(), label: c.label, icon: c.icon })),
    stats: (value.stats ?? []).map((s) => ({ _key: crypto.randomUUID(), value: s.value, label: s.label })),
  };
}

export default function ProfileExtrasEditor({
  value,
  onSave,
}: {
  value: ProfileExtras;
  // onSave -- pemanggil yang memanggil API (halaman utama vs Toko beda
  // endpoint) & memperbarui state halamannya; lempar error kalau gagal.
  onSave: (next: ProfileExtras) => Promise<void>;
}) {
  const { t } = useLocale();
  const [prevValue, setPrevValue] = useState(value);
  const [chips, setChips] = useState<DraftChip[]>(() => toDraft(value).chips);
  const [stats, setStats] = useState<DraftStat[]>(() => toDraft(value).stats);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  // Sinkron ulang draft kalau nilai tersimpan berubah (hasil simpan, atau
  // pindah halaman Toko) -- pola resmi "adjust state during render", bukan
  // efek. Status SENGAJA tidak direset di sini: simpan yang berhasil juga
  // mengubah `value`, dan pesan "Tersimpan." harus tetap terlihat.
  if (value !== prevValue) {
    setPrevValue(value);
    const d = toDraft(value);
    setChips(d.chips);
    setStats(d.stats);
  }

  function patchChip(key: string, patch: Partial<DraftChip>) {
    setChips((prev) => prev.map((c) => (c._key === key ? { ...c, ...patch } : c)));
    setStatus(null);
  }
  function patchStat(key: string, patch: Partial<DraftStat>) {
    setStats((prev) => prev.map((s) => (s._key === key ? { ...s, ...patch } : s)));
    setStatus(null);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      await onSave({
        chips: chips.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), icon: c.icon })),
        stats: stats.filter((s) => s.value.trim() || s.label.trim()).map((s) => ({ value: s.value.trim(), label: s.label.trim() })),
      });
      setStatus({ kind: "saved", message: t("dashboard.components.profileExtrasEditor.saved") });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof ApiError ? err.message : t("dashboard.components.profileExtrasEditor.saveError") });
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "min-w-0 flex-1 rounded-lg border border-app-border bg-app-surface px-2.5 py-1.5 text-xs text-app-ink focus:border-jeon-purple focus:outline-none";
  const pickerChip = chips.find((c) => c._key === pickerFor);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-app-ink">{t("dashboard.components.profileExtrasEditor.title")}</p>
        <p className="text-[11px] text-app-muted">{t("dashboard.components.profileExtrasEditor.help")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-app-muted">
          {t("dashboard.components.profileExtrasEditor.chipsLabel").replace("{max}", String(MAX_CHIPS))}
        </p>
        {chips.map((chip) => {
          const lib = getLibraryIcon(chip.icon);
          const color = libraryIconColor(chip.icon);
          return (
            <div key={chip._key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPickerFor(chip._key)}
                title={t("dashboard.components.profileExtrasEditor.chooseIcon")}
                aria-label={t("dashboard.components.profileExtrasEditor.chooseIcon")}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-surface text-app-muted hover:border-jeon-purple"
                style={color ? { color } : undefined}
              >
                {lib ? <lib.Icon className="h-4 w-4" /> : <IconPlus className="h-3.5 w-3.5" />}
              </button>
              <input
                type="text"
                maxLength={24}
                value={chip.label}
                placeholder={t("dashboard.components.profileExtrasEditor.chipPlaceholder")}
                aria-label={t("dashboard.components.profileExtrasEditor.chipLabelAria")}
                onChange={(e) => patchChip(chip._key, { label: e.target.value })}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  setChips((prev) => prev.filter((c) => c._key !== chip._key));
                  setStatus(null);
                }}
                aria-label={t("dashboard.components.profileExtrasEditor.remove")}
                className="flex-shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-red-50 hover:text-red-600"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {chips.length < MAX_CHIPS && (
          <button
            type="button"
            onClick={() => setChips((prev) => [...prev, { _key: crypto.randomUUID(), label: "", icon: "" }])}
            className="inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-app-border px-2.5 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
          >
            <IconPlus className="h-3 w-3" />
            {t("dashboard.components.profileExtrasEditor.addChip")}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-app-muted">
          {t("dashboard.components.profileExtrasEditor.statsLabel").replace("{max}", String(MAX_STATS))}
        </p>
        {stats.map((stat) => (
          <div key={stat._key} className="flex items-center gap-2">
            <input
              type="text"
              maxLength={8}
              value={stat.value}
              placeholder="48"
              aria-label={t("dashboard.components.profileExtrasEditor.statValueAria")}
              onChange={(e) => patchStat(stat._key, { value: e.target.value })}
              className={`${inputClass} max-w-[5.5rem] flex-none`}
            />
            <input
              type="text"
              maxLength={16}
              value={stat.label}
              placeholder={t("dashboard.components.profileExtrasEditor.statLabelPlaceholder")}
              aria-label={t("dashboard.components.profileExtrasEditor.statLabelAria")}
              onChange={(e) => patchStat(stat._key, { label: e.target.value })}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => {
                setStats((prev) => prev.filter((s) => s._key !== stat._key));
                setStatus(null);
              }}
              aria-label={t("dashboard.components.profileExtrasEditor.remove")}
              className="flex-shrink-0 rounded-lg p-1.5 text-app-muted hover:bg-red-50 hover:text-red-600"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        ))}
        {stats.length < MAX_STATS && (
          <button
            type="button"
            onClick={() => setStats((prev) => [...prev, { _key: crypto.randomUUID(), value: "", label: "" }])}
            className="inline-flex items-center gap-1 self-start rounded-lg border border-dashed border-app-border px-2.5 py-1.5 text-[11px] font-semibold text-app-ink hover:border-jeon-purple hover:text-jeon-purple"
          >
            <IconPlus className="h-3 w-3" />
            {t("dashboard.components.profileExtrasEditor.addStat")}
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? t("dashboard.components.profileExtrasEditor.saving") : t("dashboard.components.profileExtrasEditor.save")}
        </button>
        {status && (
          <p role="status" className={`text-[11px] font-semibold ${status.kind === "saved" ? "text-emerald-600" : "text-red-600"}`}>
            {status.message}
          </p>
        )}
      </div>

      {pickerChip && (
        <IconPickerModal
          currentKey={pickerChip.icon}
          onSelect={(icon) => {
            patchChip(pickerChip._key, { icon: icon.key });
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
}
