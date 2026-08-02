import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

test.describe("Pengaturan: Zona Berbahaya", () => {
  test("nonaktifkan akun menyembunyikan halaman publik, aktifkan kembali memunculkannya lagi", async ({ page }) => {
    const { username } = await registerAndLogin(page, "deactivate");

    await page.goto("/dashboard/design");
    const toggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }

    const publishedResponse = await page.goto(`/${username}`);
    expect(publishedResponse?.status()).toBe(200);

    await page.goto("/dashboard/settings/danger-zone");
    await expect(page.getByRole("heading", { name: "Zona Berbahaya" })).toBeVisible();

    await page.getByPlaceholder("Masukkan password").fill("Password123!");
    await page.getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "halaman publikmu tidak lagi tampil" })).toBeVisible();
    await expect(page.getByText("Akunmu sedang nonaktif.")).toBeVisible();

    // getPublicPage pakai cache: "no-store" (bukan ISR -- lihat catatan di
    // api-client.ts soal bug ISR+notFound() macet permanen yang ditemukan
    // & diperbaiki di fase ini), jadi harus langsung ter-refleksi, tanpa
    // perlu polling seperti theme.spec.ts.
    const deactivatedResponse = await page.goto(`/${username}`);
    expect(deactivatedResponse?.status()).toBe(404);

    await page.goto("/dashboard/settings/danger-zone");
    await page.getByRole("button", { name: "Aktifkan Kembali" }).click();
    await expect(page.getByRole("status").filter({ hasText: "diaktifkan kembali" })).toBeVisible();

    const reactivatedResponse = await page.goto(`/${username}`);
    expect(reactivatedResponse?.status()).toBe(200);
  });

  test("ajukan penghapusan akun lalu batalkan sebelum jatuh tempo", async ({ page }) => {
    const { username } = await registerAndLogin(page, "reqdelete");

    await page.goto("/dashboard/design");
    const toggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", "true");
    }

    await page.goto("/dashboard/settings/danger-zone");

    const wrongUsernameForm = page.locator("form", { has: page.getByPlaceholder("Ketik username-mu untuk konfirmasi") });
    await wrongUsernameForm.getByPlaceholder("Ketik username-mu untuk konfirmasi").fill("username-salah");
    await wrongUsernameForm.getByPlaceholder("Password").fill("Password123!");
    await wrongUsernameForm.getByRole("button", { name: "Ajukan Penghapusan Akun" }).click();
    await expect(page.getByRole("status").filter({ hasText: "tidak cocok" })).toBeVisible();

    await wrongUsernameForm.getByPlaceholder("Ketik username-mu untuk konfirmasi").fill(username);
    await wrongUsernameForm.getByPlaceholder("Password").fill("Password123!");
    await wrongUsernameForm.getByRole("button", { name: "Ajukan Penghapusan Akun" }).click();
    await expect(page.getByRole("status").filter({ hasText: "dijadwalkan 14 hari lagi" })).toBeVisible();
    await expect(page.getByText(/Akunmu dijadwalkan dihapus permanen pada/)).toBeVisible();

    // Modul Settings §6: pending deletion juga menyembunyikan halaman publik,
    // sama seperti nonaktifkan.
    const pendingResponse = await page.goto(`/${username}`);
    expect(pendingResponse?.status()).toBe(404);

    // Pita peringatan tampil di halaman dashboard MANAPUN, bukan cuma
    // Zona Berbahaya.
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Batalkan Penghapusan" })).toBeVisible();

    await page.goto("/dashboard/settings/danger-zone");
    await page.getByRole("button", { name: "Batalkan Penghapusan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Penghapusan akun dibatalkan" })).toBeVisible();
    await expect(page.getByPlaceholder("Ketik username-mu untuk konfirmasi")).toBeVisible();

    // notFound() TIDAK mengubah URL browser (bukan redirect, cuma status
    // 404 di URL yang sama) -- cek response status, bukan cuma toHaveURL
    // (yang akan lolos begitu saja walau halamannya masih 404 basi).
    const restoredResponse = await page.goto(`/${username}`);
    expect(restoredResponse?.status()).toBe(200);
  });

  test("unduh data ekspor", async ({ page }) => {
    await registerAndLogin(page, "export");

    await page.goto("/dashboard/settings/danger-zone");

    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Unduh Data Saya" }).click(),
    ]);
    await popup.waitForLoadState();
    expect(popup.url()).toContain("/exports/");
  });
});
