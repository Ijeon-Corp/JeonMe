import { test, expect } from "@playwright/test";
import { generateTotpCode, loginAs, registerAndLogin } from "./fixtures";

test.describe("Pengaturan: Keamanan", () => {
  test("ganti password lalu bisa login dengan password baru", async ({ page }) => {
    const { email } = await registerAndLogin(page, "secpass");

    await page.goto("/dashboard/settings/security");
    await expect(page.getByRole("heading", { name: "Keamanan" })).toBeVisible();

    await page.getByPlaceholder("Password lama").fill("Password123!");
    await page.getByPlaceholder("Password baru (min. 8 karakter)").fill("PasswordBaru456!");
    await page.getByRole("button", { name: "Ganti Password" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Password berhasil diganti." })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem("jeonme_token"));
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("PasswordBaru456!");
    await page.getByRole("button", { name: "Masuk" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
  });

  test("aktifkan 2FA lalu login berikutnya butuh kode TOTP", async ({ page }) => {
    const { email } = await registerAndLogin(page, "sec2fa");

    await page.goto("/dashboard/settings/security");
    await page.getByRole("button", { name: "Aktifkan 2FA" }).click();

    const secret = await page.locator("p", { hasText: "Kode manual:" }).locator("span").innerText();
    await page.getByPlaceholder("123456").fill(generateTotpCode(secret));
    await page.getByRole("button", { name: "Konfirmasi & Aktifkan" }).click();

    await expect(page.getByRole("status").filter({ hasText: "2FA berhasil diaktifkan." })).toBeVisible();
    await expect(page.getByText("Aktif", { exact: true })).toBeVisible();

    // Logout lalu login ulang -- Modul Settings §5: harus diminta kode 2FA
    // sebelum masuk, tidak langsung dapat token seperti akun tanpa 2FA.
    await page.evaluate(() => localStorage.removeItem("jeonme_token"));
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Masuk" }).click();

    await expect(page.getByRole("heading", { name: "Verifikasi 2FA" })).toBeVisible();
    await page.locator('input[inputmode="numeric"]').fill(generateTotpCode(secret));
    await page.getByRole("button", { name: "Verifikasi" }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
  });

  test("sesi kedua muncul di daftar & bisa dicabut", async ({ page, browser }) => {
    const { email } = await registerAndLogin(page, "secsessions");

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    try {
      await loginAs(otherPage, email);

      await page.goto("/dashboard/settings/security");
      await expect(page.getByText("Sesi ini")).toBeVisible();

      const sessionsSection = page.locator("section", { has: page.getByRole("heading", { name: "Sesi Aktif" }) });
      const otherRow = sessionsSection.locator("div.rounded-xl.border", { hasNotText: "Sesi ini" });
      await expect(otherRow).toBeVisible();
      await otherRow.getByRole("button", { name: "Cabut" }).click();

      await expect(page.getByRole("status").filter({ hasText: "Sesi dicabut." })).toBeVisible();
      await expect(otherRow).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });
});
