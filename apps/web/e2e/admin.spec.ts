import { test, expect } from "@playwright/test";
import { promoteToAdmin, registerAndLogin, resetLocalAuthRateLimit } from "./fixtures";

// Panel admin (/admin/*) -- belum ada cakupan E2E sebelumnya. Promosi ke
// role admin TIDAK punya alur UI sama sekali (akun admin pertama selalu
// dibuat manual di database sungguhan, lihat promoteToAdmin di fixtures.ts)
// jadi test ini mem-bootstrap lewat SQL langsung, persis seperti operator
// sungguhan melakukannya, lalu SISANYA murni lewat UI admin sungguhan.
test.describe("Panel Admin", () => {
  test("admin bisa menangguhkan & mengaktifkan kembali pengguna, langsung berlaku di login", async ({ browser }) => {
    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      const { username: targetUsername, email: targetEmail } = await registerAndLogin(targetPage, "admintarget");
      await targetPage.getByRole("button", { name: "Keluar" }).click();
      await targetPage.waitForURL("**/login", { timeout: 10000 });

      const { username: adminUsername } = await registerAndLogin(adminPage, "adminacct");
      promoteToAdmin(adminUsername);

      // Login berikutnya untuk akun admin diarahkan ke /admin, bukan
      // /dashboard (probe getAdminSummary() di login/page.tsx) -- tapi sesi
      // yang SUDAH berjalan ini cukup dinavigasikan langsung, AdminGuard
      // sendiri yang mengecek role dari DB tiap request (bukan klaim JWT
      // lama), jadi tidak perlu logout+login ulang.
      await adminPage.goto("/admin/users");
      await expect(adminPage.getByRole("heading", { name: "Pengguna" })).toBeVisible({ timeout: 10000 });

      await adminPage.getByPlaceholder("Cari email/username...").fill(targetUsername);
      await adminPage.getByRole("button", { name: "Cari" }).click();
      // Kartu baris pengguna (bukan wrapper luar mana pun) -- kelas ini
      // spesifik untuk satu <div> per pengguna di admin/users/page.tsx.
      const targetRow = adminPage
        .locator("div.rounded-xl.border.border-border.bg-white.px-4.py-3.shadow-card")
        .filter({ hasText: targetUsername });
      await expect(targetRow.getByRole("button", { name: "Tangguhkan" })).toBeVisible({ timeout: 10000 });
      await targetRow.getByRole("button", { name: "Tangguhkan" }).click();
      await expect(targetRow.getByRole("button", { name: "Aktifkan" })).toBeVisible({ timeout: 10000 });
      await expect(adminPage.getByText("ditangguhkan")).toBeVisible();

      // Akun yang ditangguhkan langsung ditolak di LOGIN BERIKUTNYA (dicek
      // di sana, bukan di setiap request -- lihat AuthHandler.Login). Ini
      // bukan lewat loginAs()/registerAndLogin() (yang menganggap sukses
      // sebagai satu-satunya hasil valid) karena di sini kegagalan justru
      // yang diharapkan -- tapi bucket rate-limit auth tetap DIBAGI dengan
      // helper itu, jadi tetap perlu direset manual di sini supaya toast
      // "terlalu banyak permintaan" tidak keliru dikira bukti suspend.
      resetLocalAuthRateLimit();
      await targetPage.goto("/login");
      await targetPage.locator('input[type="email"]').fill(targetEmail);
      await targetPage.locator('input[type="password"]').fill("Password123!");
      await targetPage.getByRole("button", { name: "Masuk" }).click();
      await expect(targetPage.getByText("akun ini sedang ditangguhkan, hubungi admin")).toBeVisible({ timeout: 10000 });
      await expect(targetPage).not.toHaveURL(/\/dashboard$/);

      // Admin mengaktifkan kembali -> login langsung normal lagi.
      await adminPage.getByRole("button", { name: "Aktifkan" }).click();
      await expect(adminPage.getByRole("button", { name: "Tangguhkan" })).toBeVisible({ timeout: 10000 });

      resetLocalAuthRateLimit();
      await targetPage.getByRole("button", { name: "Masuk" }).click();
      await targetPage.waitForURL("**/dashboard", { timeout: 10000 });
    } finally {
      await targetContext.close();
      await adminContext.close();
    }
  });
});
