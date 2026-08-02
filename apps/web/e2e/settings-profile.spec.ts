import { test, expect } from "@playwright/test";
import { registerAndLogin, uniqueUsername } from "./fixtures";

test.describe("Pengaturan: Profil & Akun", () => {
  test("mengubah nama tampilan/bio/kategori menampilkan toast sukses", async ({ page }) => {
    await registerAndLogin(page, "profile");

    await page.goto("/dashboard/settings/profile");
    await expect(page.getByRole("heading", { name: "Profil & Akun" })).toBeVisible();

    await page.getByLabel("Nama Tampilan").fill("Nama E2E");
    await page.getByLabel("Bio").fill("Bio dari test e2e");
    await page.getByLabel("Kategori").fill("Musik");
    await page.getByRole("button", { name: "Simpan Perubahan" }).click();

    // Requirement UI wajib Modul Settings: setiap aksi simpan harus
    // menampilkan toast, bukan silent save.
    await expect(page.getByRole("status").filter({ hasText: "Profil berhasil disimpan." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Nama Tampilan")).toHaveValue("Nama E2E");
    await expect(page.getByLabel("Bio")).toHaveValue("Bio dari test e2e");
    await expect(page.getByLabel("Kategori")).toHaveValue("Musik");
  });

  test("ganti username mengalihkan pengunjung dari alamat lama (redirect permanen)", async ({ page }) => {
    const { username: oldUsername } = await registerAndLogin(page, "userchange");
    const newUsername = uniqueUsername("moved");

    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/dashboard/settings/profile");
    const usernameInput = page.getByLabel("Username");
    await usernameInput.fill(newUsername);
    await page.getByRole("button", { name: "Simpan Perubahan" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Profil berhasil disimpan." })).toBeVisible();
    await expect(usernameInput).toHaveValue(newUsername);

    // Modul Settings §2: alamat lama TIDAK BOLEH 404 selama window redirect
    // aktif -- harus mendarat di halaman publik username BARU.
    await page.goto(`/${oldUsername}`);
    await expect(page).toHaveURL(new RegExp(`/${newUsername}$`));
  });

  test("username yang baru saja ditinggalkan tidak bisa direbut pengguna lain", async ({ page, browser }) => {
    const { username: oldUsername } = await registerAndLogin(page, "vacator");
    const newUsername = uniqueUsername("vacated");

    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/dashboard/settings/profile");
    await page.getByLabel("Username").fill(newUsername);
    await page.getByRole("button", { name: "Simpan Perubahan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profil berhasil disimpan." })).toBeVisible();

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    otherPage.on("dialog", (dialog) => dialog.accept());
    try {
      await registerAndLogin(otherPage, "squatter");
      await otherPage.goto("/dashboard/settings/profile");
      await otherPage.getByLabel("Username").fill(oldUsername);
      await otherPage.getByRole("button", { name: "Simpan Perubahan" }).click();

      await expect(
        otherPage.getByRole("status").filter({ hasText: /baru saja ditinggalkan|masih direservasi/ })
      ).toBeVisible();
    } finally {
      await otherContext.close();
    }
  });
});
