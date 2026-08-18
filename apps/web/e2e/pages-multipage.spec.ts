import { test, expect } from "@playwright/test";
import { grantPremium, registerAndLogin } from "./fixtures";

// Halaman tambahan (/dashboard/pages) -- belum ada cakupan E2E sebelumnya.
// Menguji pola gating Premium paling eksplisit di seluruh app: kreator
// gratis maks 1 Toko + 0 halaman tambahan lain, Premium sampai 5 Toko + 5
// halaman tambahan (lihat CLAUDE.md & FREE_PRODUK_PAGE_LIMIT/
// PREMIUM_EXTRA_PAGE_LIMIT/PREMIUM_PRODUK_PAGE_LIMIT di page.tsx). Satu akun
// dipakai untuk seluruh alur (gratis -> upgrade Premium via DB seed, lihat
// grantPremium di fixtures.ts) supaya hemat bucket rate-limit auth.
test.describe("Halaman Tambahan & Batas Premium", () => {
  test("akun gratis dibatasi 1 Toko, upgrade Premium membuka Bio/Landing & Toko tambahan", async ({ page }) => {
    const { username } = await registerAndLogin(page, "pages");

    await page.goto("/dashboard/pages");
    await expect(page.getByRole("button", { name: "Buat Halaman Baru" })).toBeVisible();

    // Toko PERTAMA -- slug otomatis = username, jenis "Produk" default
    // (Bio/Landing disabled untuk akun gratis).
    await page.getByRole("button", { name: "Buat Halaman Baru" }).click();
    await page.locator('input[type="text"]').first().fill("Toko Utama E2E");
    await page.getByRole("button", { name: "Buat Halaman", exact: true }).click();
    await expect(page.getByText("Toko Utama E2E")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`jeon.id/p/${username}`)).toBeVisible();

    // Jatah gratis (1 Halaman Produk, 0 Bio/Landing) sudah habis -- tombol
    // "Buat Halaman Baru" digantikan blok "jatah habis" + CTA upgrade
    // (canCreateAny=false, lihat page.tsx).
    await expect(page.getByRole("button", { name: "Buat Halaman Baru" })).toHaveCount(0);
    await expect(page.getByText("Jatah Halaman Produk gratis sudah terpakai")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lihat Langganan Premium" })).toBeVisible();

    // Upgrade ke Premium lewat DB seed (pembayaran sungguhan butuh redirect
    // penuh ke Midtrans, lihat catatan panjang di fixtures.ts grantPremium)
    // -- backend HARUS menegakkan ulang isPremiumUser() dari DB, bukan
    // percaya state lama di client, jadi reload halaman untuk membuktikannya.
    grantPremium(username);
    await page.reload();

    await expect(page.getByRole("button", { name: "Buat Halaman Baru" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("0/5 Bio/Landing")).toBeVisible();
    await expect(page.getByText("1/5 Produk")).toBeVisible();

    // Sekarang buat Halaman Bio tambahan (khusus Premium) -- default jenis
    // "bio" begitu Premium (canCreateBioLanding true), butuh slug bebas
    // (bukan Toko pertama lagi).
    await page.getByRole("button", { name: "Buat Halaman Baru" }).click();
    await expect(page.getByRole("button", { name: "Halaman Bio" })).toBeEnabled();
    const pageName = "Bio Kedua E2E";
    // Slug UNIK per run (bukan literal "bio-kedua-e2e") -- slug bersifat
    // global lintas SEMUA akun (bukan per-user), jadi string tetap akan
    // bentrok "slug ini sudah dipakai" begitu test ini dijalankan lebih
    // dari sekali (ditemukan lewat run berulang sesi ini sendiri).
    const slug = `bio-kedua-${username}`;
    await page.locator('input[type="text"]').first().fill(pageName);
    await page.getByPlaceholder("toko-skincare").fill(slug);
    await page.getByRole("button", { name: "Buat Halaman", exact: true }).click();

    await expect(page.getByText(pageName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(`jeon.id/p/${slug}`)).toBeVisible();
    await expect(page.getByText("1/5 Bio/Landing")).toBeVisible();
  });
});
