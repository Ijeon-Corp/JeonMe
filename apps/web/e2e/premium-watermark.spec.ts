import { test, expect } from "@playwright/test";
import { grantPremium, publishPage, registerAndLogin, runSql } from "./fixtures";

// Gating Premium untuk watermark -- pola PALING eksplisit ditandai wajib
// diuji ulang di backend menurut CLAUDE.md ("Field yang dikirim ke halaman
// publik (mis. hide_watermark) juga digerbang server-side sebelum dikirim,
// lihat finishPublicPageResponse di page.go, jangan andalkan frontend
// saja"). Komentar di dashboard/design/page.tsx sendiri bilang gamblang:
// "Gerbang sungguhan tetap di backend ... ini murni UI." Test ini
// membuktikan itu LANGSUNG -- bukan cuma memeriksa toggle terkunci di UI
// (yang bisa saja dilewati kalau ada bug di endpoint update), tapi menulis
// hide_watermark=true LANGSUNG ke database lewat SQL (melewati UI/API sama
// sekali, meniru state rusak/dimanipulasi) untuk akun gratis, lalu
// memastikan halaman publik TETAP menampilkan watermark -- membuktikan
// backend menghitung ulang gate dari isPremiumUser() setiap kali merespons,
// bukan cuma percaya kolom tersimpan.
test.describe("Langganan Premium: Gating Watermark", () => {
  test("akun gratis tidak bisa hilangkan watermark (UI terkunci & backend re-gate), Premium bisa", async ({ page }) => {
    const { username } = await registerAndLogin(page, "premium");
    await publishPage(page);

    const watermarkPill = "Buat halaman gratis di Jeonme";

    await page.goto("/dashboard/design");
    const watermarkToggle = page.getByRole("switch", { name: "Sembunyikan watermark" });
    await expect(watermarkToggle).toBeDisabled();
    await expect(page.getByText("Khusus kreator Premium -- upgrade dulu")).toBeVisible();

    // Watermark tampil di halaman publik selagi masih gratis (baseline).
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(watermarkPill)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15000, intervals: [3000] });

    // Manipulasi LANGSUNG lewat DB (lewati UI/API sepenuhnya) -- simulasi
        // state hide_watermark=true pada akun yang TETAP gratis. Kalau backend
    // cuma mengirim balik nilai kolom ini apa adanya (tanpa re-cek
    // isPremiumUser di response publik), watermark akan hilang di sini --
    // itulah tepatnya yang harus TIDAK terjadi.
    runSql(`UPDATE pages SET hide_watermark = true WHERE user_id = (SELECT id FROM users WHERE username = '${username}') AND is_primary = true;`);
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(watermarkPill)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 15000, intervals: [3000] });

    // Kembalikan ke false & upgrade sungguhan ke Premium (lewat seed
    // subscriptions aktif -- lihat catatan grantPremium di fixtures.ts),
    // lalu selesaikan alur lewat UI SUNGGUHAN (bukan SQL lagi) untuk
    // membuktikan jalur normal juga bekerja setelah premium aktif.
    runSql(`UPDATE pages SET hide_watermark = false WHERE user_id = (SELECT id FROM users WHERE username = '${username}') AND is_primary = true;`);
    grantPremium(username);

    await page.goto("/dashboard/design");
    await expect(watermarkToggle).toBeEnabled({ timeout: 10000 });
    await watermarkToggle.click();
    await expect(watermarkToggle).toHaveAttribute("aria-checked", "true");

    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(watermarkPill)).toHaveCount(0);
    }).toPass({ timeout: 15000, intervals: [3000] });
  });
});
