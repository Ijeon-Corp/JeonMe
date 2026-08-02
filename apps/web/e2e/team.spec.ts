import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

test.describe("Pengaturan: Tim & Kolaborator", () => {
  test("undang lewat username akun existing, ubah role, dan riwayat aktivitas tercatat", async ({ page, browser }) => {
    const { username: ownerUsername } = await registerAndLogin(page, "teamowner");

    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    try {
      // Modul Settings §4 acceptance criteria: undang akun yang SUDAH ada
      // (lewat username, bukan email) tanpa syarat "belum terdaftar".
      const { username: collabUsername, email: collabEmail } = await registerAndLogin(collabPage, "teamcollab");

      await page.goto("/dashboard/team");
      await page.getByPlaceholder("email@contoh.com atau username").fill(collabUsername);
      await page.getByLabel("Role kolaborator baru").selectOption("content_admin");
      await page.getByRole("button", { name: "Kirim Undangan" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Undangan dikirim." })).toBeVisible();
      await expect(page.getByText(collabEmail, { exact: true })).toBeVisible();
      await expect(page.getByText(/Mengundang .* sebagai Admin Konten/)).toBeVisible();

      await collabPage.goto("/dashboard/team");
      const inviteSection = collabPage.locator("section", { has: collabPage.getByText("Undangan untuk Saya") });
      await expect(inviteSection.getByText(`@${ownerUsername}`)).toBeVisible();
      await expect(inviteSection.getByText("Admin Konten (Tautan & Desain)")).toBeVisible();
      await collabPage.getByRole("button", { name: "Terima" }).click();
      await expect(collabPage.getByText(`@${ownerUsername}`)).not.toBeVisible();

      await page.reload();
      await expect(page.getByText(/Menerima undangan|menerima undangan/)).toBeVisible();

      const roleSelect = page.getByLabel(`Role ${collabEmail}`);
      await roleSelect.selectOption("full_access");
      await expect(page.getByRole("status").filter({ hasText: "diperbarui" })).toBeVisible();
      await expect(page.getByText(/Mengubah role .* ke Akses Penuh/)).toBeVisible();

      page.once("dialog", (dialog) => dialog.accept());
      await page.getByTitle("Cabut akses").click();
      await expect(page.getByRole("status").filter({ hasText: "Akses kolaborator dicabut." })).toBeVisible();
      await expect(page.getByText(/Mencabut akses/)).toBeVisible();
    } finally {
      await collabContext.close();
    }
  });

  test("undang username yang tidak ada ditolak", async ({ page }) => {
    await registerAndLogin(page, "teambadinv");

    await page.goto("/dashboard/team");
    await page.getByPlaceholder("email@contoh.com atau username").fill("username-tidak-pernah-ada-sekali-ini");
    await page.getByRole("button", { name: "Kirim Undangan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "tidak ditemukan" })).toBeVisible();
  });
});
