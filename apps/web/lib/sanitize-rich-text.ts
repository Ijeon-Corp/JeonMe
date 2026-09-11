import DOMPurify from "isomorphic-dompurify";

// sanitizeRichTextHtml -- diekstrak dari PagePreview.tsx (SATU-SATUNYA
// pemakai sebelumnya, blok "text") supaya bisa dipakai ULANG oleh
// field isi/deskripsi panjang lain yang diperluas jadi rich text
// 12 September 2026 ("tiap blok yang ada teks nya buat semua jadi rich
// teks", dikonfirmasi via AskUserQuestion: field isi/deskripsi panjang
// saja, BUKAN judul/label pendek) -- jawaban FAQ (FaqBlock.tsx), deskripsi
// item List/kutipan Testimoni (ListBlock.tsx), deskripsi Embed Link
// (PagePreview.tsx). HTML APA PUN dari kreator WAJIB disaring lewat
// DOMPurify sebelum dangerouslySetInnerHTML, whitelist SEMPIT (cuma tag
// yang benar-benar bisa dihasilkan toolbar RichTextEditor: bold/italic/
// underline/strike/list/paragraph/line-break) -- TANPA script/iframe/style/
// atribut event apa pun, mencegah XSS lewat isi blok kreator.
export function sanitizeRichTextHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "strike", "ol", "ul", "li"],
    ALLOWED_ATTR: [],
  });
}
