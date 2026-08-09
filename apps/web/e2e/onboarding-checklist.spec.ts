import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Gap #5 dari laporan benchmark kompetitif (permintaan langsung pengguna, 9
// Agustus 2026): pita onboarding sebelumnya cuma "Baru di Jeonme? Lihat
// Tutorial" statis -- diganti checklist progresif yang dihitung SERVER-SIDE
// dari state akun sungguhan (bukan dummy). Test ini membuktikan progres
// benar-benar berubah mengikuti aksi kreator sungguhan (terbitkan halaman,
// tambah tautan), bukan cuma tampilan statis dengan angka palsu.
test.describe("Onboarding: Checklist Progresif", () => {
  test("progres checklist naik mengikuti aksi sungguhan (terbitkan halaman, tambah tautan)", async ({ page }) => {
    await registerAndLogin(page, "onbcheck");

    await expect(page.getByText("Lengkapi setup akunmu -- 0/4 selesai")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Lihat semua" }).click();
    await expect(page.getByText("Terbitkan halaman publik")).toBeVisible();
    await expect(page.getByText("Tambah tautan atau produk pertama")).toBeVisible();

    // Terbitkan halaman -- lewat toggle sungguhan di /dashboard/design,
    // BUKAN publishPage() fixture (test ini SPESIFIK memverifikasi
    // checklist bereaksi ke aksi ini, jadi ditempuh langsung lewat UI).
    await page.goto("/dashboard/design");
    const publishToggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
    await publishToggle.click();
    await expect(publishToggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(page.getByText("Lengkapi setup akunmu -- 1/4 selesai")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Lihat semua" }).click();
    // Item yang sudah selesai dicoret & tidak lagi berupa link actionable.
    // .first() -- halaman /dashboard/design MASIH terbuka (baru direload,
    // bukan navigasi), yang juga punya teks sama persis (label toggle
    // "Terbitkan halaman publik") -- checklist di banner SELALU dirender
    // lebih dulu di DOM (di atas konten halaman), jadi .first() = banner.
    await expect(page.getByText("Terbitkan halaman publik", { exact: true }).first()).toHaveClass(/line-through/);

    // Tambah tautan pertama -- pola sama seperti links.spec.ts.
    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();
    await page.getByPlaceholder("Judul tautan").fill("Toko Online Saya");
    await page.getByPlaceholder("https://...").fill("https://example.com/toko");
    await page
      .locator("form", { has: page.getByPlaceholder("Judul tautan") })
      .getByRole("button", { name: "Tambah" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: "Toko Online Saya" })).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText("Lengkapi setup akunmu -- 2/4 selesai")).toBeVisible({ timeout: 10000 });
  });
});
