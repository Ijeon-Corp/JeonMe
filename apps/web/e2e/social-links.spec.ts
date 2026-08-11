import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

// Kontak Sosial (Instagram/TikTok/Facebook/WhatsApp/dll) -- permintaan
// langsung pengguna, 11 Agustus 2026: "dibagian profile atau menu link bio
// itu bisa mengisi kontak instagram tiktok facebook whatsapp dll jika
// mengisi bisa kita tampilkan di bagian bawah deskripsi nya saat akses
// link dan sudah built in icon nya". Diisi di panel kolaps "Kontak Sosial"
// di /dashboard/links, dirender sebagai baris ikon bulat di bawah bio
// halaman publik -- platform yang belum diisi TIDAK ikut dirender.
test.describe("Kontak Sosial", () => {
  test("kreator isi Instagram/WhatsApp/Email, tampil sebagai ikon di bawah bio halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "social");
    await publishPage(page);

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: /kontak sosial/i }).click();

    await page.getByPlaceholder(/Instagram/).fill("jeonme.official");
    await page.getByPlaceholder(/WhatsApp/).fill("6281234567890");
    await page.getByPlaceholder(/^Email/).fill("halo@jeonme.com");
    // TikTok SENGAJA dibiarkan kosong -- verifikasi ikonnya TIDAK ikut
    // dirender (platform kosong = tidak tampil, bukan ikon nonaktif).
    await page.getByRole("button", { name: /^simpan$/i }).click();

    // Panel tertutup lagi setelah simpan (state sukses).
    await expect(page.getByPlaceholder(/Instagram/)).not.toBeVisible();

    // Halaman publik UTAMA (/username) pakai cache ganda (ISR Next.js +
    // Redis 30 detik API) -- tunggu sampai keduanya lewat, pola sama
    // seperti design-blocks.spec.ts/theme.spec.ts.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.locator('a[title="Instagram"]')).toHaveAttribute("href", "https://instagram.com/jeonme.official", {
        timeout: 3000,
      });
      await expect(page.locator('a[title="WhatsApp"]')).toHaveAttribute("href", "https://wa.me/6281234567890", { timeout: 3000 });
      await expect(page.locator('a[title="Email"]')).toHaveAttribute("href", "mailto:halo@jeonme.com", { timeout: 3000 });
      await expect(page.locator('a[title="TikTok"]')).toHaveCount(0);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
