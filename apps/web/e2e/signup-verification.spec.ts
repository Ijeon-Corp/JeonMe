import { test, expect } from "@playwright/test";
import { resetLocalAuthRateLimit, uniqueUsername } from "./fixtures";

// Permintaan langsung pengguna, 19 Agustus 2026: "saat sign up butuh kode
// verif yang dikirim dari email untuk aktivasi baru setelah itu akun bisa
// digunakan". registerAndLogin (fixtures.ts) sudah menguji jalur BENAR
// (kode terisi otomatis, submit, sampai /dashboard) secara implisit lewat
// SEMUA spec lain yang memakainya -- test di sini fokus ke perilaku yang
// TIDAK dicakup fixture itu: kode salah ditolak dengan pesan jelas, TIDAK
// ikut lanjut ke dashboard.
test.describe("Verifikasi Email Signup", () => {
  test("kode salah ditolak, tidak lanjut ke dashboard", async ({ page }) => {
    resetLocalAuthRateLimit();
    const username = uniqueUsername("verifywrong");
    const email = `${username}@example.com`;

    await page.goto("/register");
    await page.locator('input[placeholder="username-kamu"]').fill(username);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("Password123!");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Daftar Gratis" }).click();

    await page.waitForURL("**/verify-email**", { timeout: 15000 });

    // Kode dev sudah terisi otomatis (AppEnv lokal != production) --
    // sengaja diganti kode SALAH untuk menguji jalur tolak.
    const codeInput = page.locator('input[inputmode="numeric"]');
    await expect(codeInput).not.toHaveValue("", { timeout: 10000 });
    const realCode = await codeInput.inputValue();
    const wrongCode = realCode === "111111" ? "222222" : "111111";
    await codeInput.fill(wrongCode);
    await page.getByRole("button", { name: "Verifikasi & Masuk" }).click();

    await expect(page.getByText(/kode tidak valid atau sudah kedaluwarsa/i)).toBeVisible({ timeout: 10000 });
    // Belum boleh sampai dashboard sama sekali.
    await expect(page).toHaveURL(/\/verify-email/);

    // Kode yang BENAR (dev-prefill asli) tetap bisa dipakai setelahnya --
    // membuktikan satu percobaan salah tidak ikut merusak kode yang valid.
    await codeInput.fill(realCode);
    await page.getByRole("button", { name: "Verifikasi & Masuk" }).click();

    // Animasi sukses (permintaan langsung pengguna, 19 Agustus 2026:
    // "tambahkan animasi verifikasi berhasil setelah klik oke baru redirect
    // ke dashboard") -- muncul dulu SEBELUM redirect, harus klik "OK".
    await expect(page.getByRole("heading", { name: "Verifikasi Berhasil!" })).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/verify-email/);
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.waitForURL("**/dashboard", { timeout: 15000 });
  });
});
