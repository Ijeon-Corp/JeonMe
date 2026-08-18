import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

test.describe("Autentikasi", () => {
  test("mengakses /dashboard tanpa sesi redirect ke /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("register lewat form lalu masuk ke dashboard", async ({ page }) => {
    const { username } = await registerAndLogin(page, "auth");
    await expect(page).toHaveURL(/\/dashboard$/);
    // Chip "halaman publikmu" di sidebar membuktikan sesi tersimpan &
    // getMyPage() sukses dipanggil dengan token yang baru didapat.
    await expect(page.getByText(`jeon.id/${username}`)).toBeVisible({ timeout: 10000 });
  });

  test("logout menghapus sesi dan kembali ke /login", async ({ page }) => {
    await registerAndLogin(page, "logout");
    await page.getByRole("button", { name: "Keluar" }).click();
    await page.waitForURL("**/login", { timeout: 10000 });
    // Sesi harus benar-benar hilang -- navigasi balik ke /dashboard harus
    // redirect ke /login lagi, bukan diam-diam tetap bisa masuk.
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
  });
});
