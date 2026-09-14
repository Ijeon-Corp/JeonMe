import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Regresi: guard tombol "Edit Konten" di links/page.tsx sebelumnya cuma
// mendaftar video/faq/maps/text/project_showcase -- "accordion" hilang
// padahal openContentEdit/handleSaveContent DAN panel render-nya sudah
// mendukungnya sejak awal. Akibatnya blok accordion bisa dibuat lewat
// modal Tambah, tapi isinya TIDAK PERNAH bisa diedit lagi setelahnya (tombol
// "Edit Konten" tidak pernah muncul). Ditemukan 6 September 2026 saat audit
// guard yang sama untuk redesain drill-down Katalog/FAQ.
test("accordion: tombol Edit Konten muncul dan isi bisa diedit & tersimpan", async ({ page }) => {
  const { username } = await registerAndLogin(page, "accordion");
  await page.goto("/dashboard/links");

  await page.getByRole("button", { name: "Tambah" }).first().click();
  await page.getByRole("button", { name: "Konten", exact: true }).click();
  await page.getByRole("button", { name: /Accordion/ }).click();
  await page.getByPlaceholder("mis. Kebijakan Pengembalian").fill("Kebijakan Pengembalian");
  // Isi "Saat Diklik" SEKARANG rich-text (TipTap, commit 4399631 "full
  // parity mode Simple vs Builder"), placeholder <textarea> lama sudah
  // tidak ada, ganti contenteditable (pola sama dengan
  // catalog-nested-blocks.spec.ts / builder-mode.spec.ts).
  const contentEditor = page.locator('[contenteditable="true"]');
  await contentEditor.click();
  // toBeFocused() sebelum mengetik -- editor TipTap baru mount saat blockType
  // "accordion" dipilih (immediatelyRender:false di RichTextEditor.tsx),
  // tanpa jeda ini karakter pertama kadang hilang (klik terjadi sebelum
  // binding keydown ProseMirror sungguh siap, ditemukan lewat flake nyata
  // saat memperbaiki test ini -- "Isi awal." jadi "si awal.").
  await expect(contentEditor).toBeFocused();
  await page.keyboard.type("Isi awal.");
  await page.getByRole("button", { name: "Buat Blok" }).click();

  const editButton = page.getByRole("button", { name: "Edit Konten" });
  await expect(editButton).toBeVisible({ timeout: 10000 });
  await editButton.click();

  await expect(contentEditor).toBeVisible();
  await expect(contentEditor).toHaveText("Isi awal.");
  // Ganti seluruh isi: select-all lalu ketik ulang (ControlOrMeta menangani
  // Cmd di macOS vs Ctrl di Linux/Windows secara otomatis).
  await contentEditor.click();
  await expect(contentEditor).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Barang bisa dikembalikan dalam 7 hari.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(editButton).toBeVisible({ timeout: 10000 });

  await page.reload();
  await editButton.click();
  await expect(contentEditor).toHaveText("Barang bisa dikembalikan dalam 7 hari.");

  await page.goto(`/${username}`);
  await expect(page.getByText("Kebijakan Pengembalian", { exact: true })).toBeVisible();
  await page.getByText("Kebijakan Pengembalian", { exact: true }).click();
  await expect(page.getByText("Barang bisa dikembalikan dalam 7 hari.")).toBeVisible();
});
