"use client";

import { useState } from "react";
import FormField from "@/components/FormField";
import { useLocale } from "@/lib/locale-context";
import type { LinkItem } from "@/lib/api-client";

// BlockTitleField -- edit judul blok di DETAIL blok (permintaan langsung
// pengguna, 25 September 2026: "kenapa block title hanya diisi saat baru
// menambahkan blok harusnya di detail blok juga ada"). Sebelumnya judul
// cuma bisa diubah lewat pensil hover di baris daftar. Disimpan saat
// blur/Enter (bukan per ketikan). Judul tautan & Katalog wajib diisi
// (backend/identitas baris), tipe lain boleh dikosongkan -- judul kosong =
// tidak ditampilkan di halaman publik.
export default function BlockTitleField({ link, onSave }: { link: LinkItem; onSave: (title: string) => void }) {
  const { t } = useLocale();
  const required = link.block_type === "link" || link.block_type === "catalog";
  const [draft, setDraft] = useState(link.title ?? "");
  const [prevTitle, setPrevTitle] = useState(link.title ?? "");
  // Sinkron kalau judul berubah dari luar (pensil di daftar, rollback).
  if ((link.title ?? "") !== prevTitle) {
    setPrevTitle(link.title ?? "");
    setDraft(link.title ?? "");
  }

  function commit() {
    const next = draft.trim();
    if (required && !next) {
      setDraft(link.title ?? "");
      return;
    }
    if (next !== (link.title ?? "")) onSave(next);
  }

  return (
    <FormField label={t("dashboard.pages.links.blockTitleField.label")} optional={!required} hint={t("dashboard.pages.links.blockTitleField.hint")}>
      <input
        type="text"
        maxLength={100}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={t("dashboard.pages.links.blockTitleField.placeholder")}
        className="w-full rounded-lg border border-app-border px-3 py-2 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
      />
    </FormField>
  );
}
