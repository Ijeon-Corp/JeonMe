import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

test.describe("Tema", () => {
  test("memilih tema di galeri memperbarui pratinjau langsung & halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "theme");
    await publishPage(page);

    await page.goto("/dashboard/design/theme");
    await expect(page.getByRole("heading", { name: "Tema" })).toBeVisible();

    // "Ocean" -- preset solid/gradien sederhana, sudah lolos audit kontras
    // No.129 -- dipilih dari tab "Warna & Gradien" (tab default).
    await page.getByRole("button", { name: "Ocean", exact: true }).click();

    // Panel pratinjau langsung (PagePreview di dalam PhoneFrame, plain div
    // bukan iframe) harus memperbarui kelas latar SEGERA tanpa reload --
    // "from-sky-50" unik untuk tema Ocean (lihat page-themes.ts).
    await expect(page.locator('main[class*="from-sky-50"]')).toBeVisible({ timeout: 10000 });

    // Halaman publik sungguhan (server component, ISR) harus ikut berubah
    // setelah cache 60 detik lewat.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.locator('main[class*="from-sky-50"]')).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("ganti tema mereset kustomisasi Tombol/Font lama (No.130)", async ({ page }) => {
    const { username } = await registerAndLogin(page, "themereset");
    await publishPage(page);

    // Pilih tema Cyber dulu, lalu kustomisasi warna tombol lewat panel
    // Tombol -- mengaktifkan custom_style_override.
    await page.goto("/dashboard/design/theme");
    await page.getByRole("button", { name: "Cyber", exact: true }).click();

    await page.goto("/dashboard/design/tombol");
    const colorInput = page.locator('input[type="color"]').first();
    await colorInput.fill("#ff00ff");
    // handleStyleOverride di halaman ini terpasang di onBlur (bukan
    // onChange) -- fill() Playwright TIDAK memicu blur, harus dipicu manual
    // supaya custom_style_override sungguh menyala sebelum lanjut ke langkah
    // berikutnya.
    await colorInput.blur();
    await page.waitForTimeout(500);

    // Sekarang pilih tema BARU (Grid) -- No.130 mengharuskan warna tombol
    // kustom lama (#ff00ff) TIDAK lagi terlihat, digantikan warna asli tema
    // Grid begitu tema baru dipilih.
    await page.goto("/dashboard/design/theme");
    await page.getByRole("button", { name: "Grid", exact: true }).click();

    await expect(async () => {
      await page.goto(`/${username}`);
      const html = await page.content();
      // Pastikan halaman SUNGGUH menampilkan tema Grid (bukan cuma halaman
      // kosong/belum terbit yang trivially "tidak mengandung" apa pun --
      // false-positive yang ditemukan di run pertama test ini) DAN warna
      // kustom lama benar-benar sudah hilang.
      expect(html).toContain("ECF87F");
      expect(html).not.toContain("ff00ff");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
