"use client";

import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useLocale } from "@/lib/locale-context";
import { IconBold, IconItalic, IconListBullet, IconListNumbered, IconStrikethrough, IconUnderline } from "@/components/icons";

// RichTextEditor -- redesain total Canvas Page Builder (permintaan langsung
// pengguna 10 September 2026, referensi "LYNK": "bangun rich-text
// sungguhan", dikonfirmasi via AskUserQuestion atas pilihan yang lebih
// besar daripada tetap textarea polos). SATU-SATUNYA blok yang memakainya
// adalah "text" -- block_data.text blok ini SEKARANG string HTML (bukan
// plain text lagi), lihat sanitizeBuilderTextHtml (PagePreview.tsx) untuk
// render sisi publik. TipTap dipilih (BUKAN Slate/Quill/Draft.js) --
// React-first, paket StarterKit sudah mencakup Bold/Italic/Strike/
// BulletList/OrderedList/Paragraph tanpa konfigurasi tambahan, cuma
// Underline yang perlu extension terpisah.
//
// `onChange` dipanggil onUpdate (tiap keystroke) -- AMAN dipanggil sesering
// itu karena di rute Builder (rute BARU app/builder/[pageId]/page.tsx)
// `onChange` hanya menulis ke draft LOKAL (setDraftLinks), bukan memanggil
// API -- beda dari pola onBlur dipakai field builder lain (textarea/input
// biasa) yang MEMANG langsung memanggil API sebelum arsitektur draft ini
// ada.
// legacyPlainTextToHtml -- kompatibilitas mundur: blok "text" yang dibuat
// SEBELUM redesain rich-text ini (10 September 2026) menyimpan plain
// string dgn newline literal "\n" (dulu textarea polos) -- TipTap
// mem-parse `content` sbg HTML, jadi newline literal tanpa tag apa pun
// akan kolaps jadi satu baris begitu dimuat ke editor (walau tampilan
// PUBLIK tetap benar berkat `whitespace-pre-line`, lihat PagePreview.tsx --
// ini KHUSUS memperbaiki tampilan saat kreator membuka blok lama itu utk
// diedit lagi). Deteksi "sudah HTML" pakai regex tag pembuka sederhana --
// kalau ADA, anggap sudah konten baru (RichTextEditor), lewati apa adanya.
function legacyPlainTextToHtml(text: string): string {
  if (!text || /<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("");
}

export default function RichTextEditor({ html, onChange }: { html: string; onChange: (html: string) => void }) {
  const { t } = useLocale();
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: legacyPlainTextToHtml(html),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "jeon-rich-text-content min-h-[96px] rounded-b-lg border border-t-0 border-app-border p-2.5 text-xs outline-none focus:border-jeon-purple",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Sinkronkan editor kalau `html` berubah dari LUAR (mis. blok Text lain
  // dipilih -- lihat `key={selectedNode.id}` di titik pemakaian, yang
  // memaksa remount penuh; efek ini jaga-jaga untuk kasus draft di-reset
  // dari luar tanpa remount, mis. batal simpan) TANPA memicu loop
  // (setContent hanya dipanggil kalau isinya benar-benar beda dari isi
  // editor saat ini).
  useEffect(() => {
    if (!editor) return;
    const next = legacyPlainTextToHtml(html);
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `editor` sengaja tidak diikutkan, instance stabil selama komponen ini hidup.
  }, [html]);

  if (!editor) return null;

  const buttons: { key: string; label: string; icon: (p: { className?: string }) => React.ReactElement; active: boolean; onClick: () => void }[] = [
    { key: "bold", label: t("dashboard.pages.linksBuilder.richText.bold"), icon: IconBold, active: editor.isActive("bold"), onClick: () => editor.chain().focus().toggleBold().run() },
    { key: "italic", label: t("dashboard.pages.linksBuilder.richText.italic"), icon: IconItalic, active: editor.isActive("italic"), onClick: () => editor.chain().focus().toggleItalic().run() },
    { key: "underline", label: t("dashboard.pages.linksBuilder.richText.underline"), icon: IconUnderline, active: editor.isActive("underline"), onClick: () => editor.chain().focus().toggleUnderline().run() },
    { key: "strike", label: t("dashboard.pages.linksBuilder.richText.strike"), icon: IconStrikethrough, active: editor.isActive("strike"), onClick: () => editor.chain().focus().toggleStrike().run() },
    { key: "bulletList", label: t("dashboard.pages.linksBuilder.richText.bulletList"), icon: IconListBullet, active: editor.isActive("bulletList"), onClick: () => editor.chain().focus().toggleBulletList().run() },
    { key: "orderedList", label: t("dashboard.pages.linksBuilder.richText.orderedList"), icon: IconListNumbered, active: editor.isActive("orderedList"), onClick: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-app-border bg-app-surface-2 p-1">
        {buttons.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={btn.onClick}
            aria-label={btn.label}
            aria-pressed={btn.active}
            title={btn.label}
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              btn.active ? "bg-jeon-purple text-white" : "text-app-muted hover:bg-app-surface hover:text-app-ink"
            }`}
          >
            <btn.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
