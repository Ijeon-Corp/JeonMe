import { test, expect } from "@playwright/test";
import { payOrderViaWebhook, registerAndLogin } from "./fixtures";

// Gap #4 dari laporan benchmark kompetitif (permintaan langsung pengguna, 9
// Agustus 2026): blok Donasi sebelumnya cuma toggle+judul+nominal minimum,
// dibanding Saweria/Trakteer (goal milestone + wishlist barang) jauh lebih
// tipis. Test ini menempuh alur PENUH: kreator pasang target & wishlist,
// pendonor SUNGGUHAN memilih item wishlist & bayar (lewat webhook Midtrans
// sintetis, pola sama seperti products-checkout.spec.ts -- Snap ter-hosting
// tidak bisa diselesaikan murni lewat browser), lalu verifikasi progress
// goal DAN raised_idr wishlist item sama-sama naik di halaman publik.
test.describe("Donasi: Target & Wishlist", () => {
  test("kreator pasang target+wishlist, pendonor pilih item, progress goal & wishlist naik", async ({ page, browser }) => {
    const { username } = await registerAndLogin(page, "songoal");

    const donationAmount = 20000;

    await page.goto("/dashboard/donation");
    const enableToggle = page.getByRole("switch", { name: "Aktifkan blok dukungan" });
    if ((await enableToggle.getAttribute("aria-checked")) !== "true") {
      await enableToggle.click();
    }
    await page.locator('input[placeholder="Traktir aku kopi"]').fill("Dukung Konten Aku");
    await page.locator('input[type="number"]').first().fill("10000"); // nominal minimum

    await page.getByPlaceholder("mis. Upgrade kamera streaming").fill("Upgrade Kamera Streaming");
    await page.getByPlaceholder("Target nominal (Rp), kosongkan untuk hapus target").fill("100000");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Pengaturan disimpan.")).toBeVisible();

    // Belum ada progress -- goal baru dipasang.
    await expect(page.getByText("Rp0 / Rp100.000", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "+ Tambah Item Wishlist" }).click();
    await page.getByPlaceholder("Nama barang").fill("Mic Kondensor");
    await page.getByPlaceholder("Harga (Rp)").fill("500000");
    await page.getByRole("button", { name: "Tambah", exact: true }).click();
    await expect(page.getByText("Mic Kondensor")).toBeVisible({ timeout: 10000 });

    // Pendonor SUNGGUHAN (browser context terpisah, belum login) mendukung
    // lewat halaman publik, memilih item wishlist "Mic Kondensor".
    const donorContext = await browser.newContext();
    const donorPage = await donorContext.newPage();
    let capturedCheckout: { order_id: string; invoice_url: string } | undefined;
    try {
      await expect(async () => {
        await donorPage.goto(`/${username}`);
        await expect(donorPage.getByText("Dukung Konten Aku")).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 75000, intervals: [5000] });

      await expect(donorPage.getByText("Upgrade Kamera Streaming")).toBeVisible();
      // index:1 (bukan label) -- teks opsi menyertakan raised_idr/price_idr
      // dinamis ("Mic Kondensor (Rp0/Rp500.000)"), index:0 selalu "Dukungan
      // umum", satu-satunya wishlist yang baru ditambahkan pasti index:1.
      await donorPage.getByLabel("Wujudkan wishlist (opsional)").selectOption({ index: 1 });

      await donorPage.route("**/api/v1/checkout", async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        capturedCheckout = await response.json();
        await route.fulfill({ response, json: { ...capturedCheckout, invoice_url: "/" } });
      });

      await donorPage.getByRole("button", { name: "Dukung", exact: true }).click();
      await donorPage.locator('input[type="number"]').first().fill(String(donationAmount));
      await donorPage.getByPlaceholder("Email kamu").fill(`donor-${Date.now()}@example.com`);
      await donorPage.getByRole("button", { name: "Kirim Dukungan" }).click();

      await expect.poll(() => capturedCheckout, { timeout: 15000 }).toBeTruthy();
      await payOrderViaWebhook(capturedCheckout!.order_id, donationAmount);
    } finally {
      await donorContext.close();
    }

    // Progress goal & wishlist SAMA-SAMA naik setelah lunas -- goal dari
    // SUM(orders) sejak goal dipasang, wishlist dari raised_idr yang
    // dikreditkan sinkron di webhook (lihat creditDonationWishlistItem).
    // 75s/5s (bukan 30s) -- konvensi yang sama dipakai test lain di suite
    // ini untuk halaman publik ber-cache (Redis 30 detik + ISR Next.js 60
    // detik bisa menumpuk, lihat e2e/README.md).
    //
    // "Rp 20.000" (spasi setelah Rp) -- PagePreview.tsx mengikuti gaya
    // yang SUDAH ada di file itu ("Mulai dari Rp {jumlah}"), beda dari
    // formatRupiah() dashboard ("Rp20.000" tanpa spasi) yang dipakai di
    // assersi wishlist di bawah. Bug test ditemukan lewat run pertama
    // (data backend sudah benar, cuma string assersi yang salah format).
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(
        page.getByText(`Rp ${donationAmount.toLocaleString("id-ID")} / Rp 100.000`, { exact: false })
      ).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 75000, intervals: [5000] });

    await page.goto("/dashboard/donation");
    await expect(page.getByText(`Rp${donationAmount.toLocaleString("id-ID")} / Rp500.000`, { exact: false })).toBeVisible({
      timeout: 10000,
    });
  });
});
