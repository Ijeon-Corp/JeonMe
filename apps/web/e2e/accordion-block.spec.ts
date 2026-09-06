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
  await page.getByPlaceholder("Isi teks yang muncul saat judul di atas diklik").fill("Isi awal.");
  await page.getByRole("button", { name: "Buat Blok" }).click();

  const editButton = page.getByRole("button", { name: "Edit Konten" });
  await expect(editButton).toBeVisible({ timeout: 10000 });
  await editButton.click();

  const textarea = page.getByPlaceholder("Isi teks yang muncul saat judul diklik");
  await expect(textarea).toBeVisible();
  await textarea.fill("Barang bisa dikembalikan dalam 7 hari.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(editButton).toBeVisible({ timeout: 10000 });

  await page.reload();
  await editButton.click();
  await expect(page.getByPlaceholder("Isi teks yang muncul saat judul diklik")).toHaveValue(
    "Barang bisa dikembalikan dalam 7 hari."
  );

  await page.goto(`/${username}`);
  await expect(page.getByText("Kebijakan Pengembalian", { exact: true })).toBeVisible();
  await page.getByText("Kebijakan Pengembalian", { exact: true }).click();
  await expect(page.getByText("Barang bisa dikembalikan dalam 7 hari.")).toBeVisible();
});
