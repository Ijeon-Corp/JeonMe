import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, registerAndLogin } from "./fixtures";

// Layout "Blok Kategori" -- permintaan langsung pengguna, 20 Agustus 2026:
// "bagian produk bisa ga dibuat layout baru di kelompokan seperti ini,
// misal ada blok sepatu, baju, celana ketika di klik blok sepatu maka akan
// muncul semua product sepatu nya begitu juga baju dan celana". Opsi
// KETIGA product_layout (di samping grid/stacked yang sudah ada) --
// pengunjung Toko publik melihat blok per kategori dulu, klik satu blok
// untuk drill-down ke produk kategori itu (lihat renderProductGrid,
// PagePreview.tsx).
//
// Produk dibuat sebagai "Link Eksternal" (bukan Digital Product) --
// SATU-SATUNYA jenis yang tidak butuh file diunggah untuk aktif (cukup
// sampul + tautan), jadi test ini lebih ringan tanpa mengorbankan cakupan
// (kategori & layout tidak bergantung pada jenis produk).
test.describe("Toko: layout Blok Kategori", () => {
  test("blok kategori tampil di Toko publik, klik satu blok memfilter ke produk kategori itu saja", async ({ page }) => {
    const { username } = await registerAndLogin(page, "catlayout");

    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Manage Items" }).click();

    async function createExternalLinkProduct(name: string, category: string) {
      await page.getByRole("button", { name: "Tambah Produk" }).click();
      await page.getByRole("button", { name: "Link Eksternal" }).click();
      const form = page.locator("form", { has: page.getByPlaceholder("Nama produk") });
      await form.getByPlaceholder("Nama produk").fill(name);
      await form.getByPlaceholder(/Tautan produk/).fill("https://shopee.co.id/produk-" + encodeURIComponent(name));
      await form
        .locator('input[type="file"]')
        .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
      await form.getByRole("button", { name: "Buat Produk" }).click();
      await expect(page.getByRole("row", { name: new RegExp(name) })).toBeVisible({ timeout: 10000 });

      // Atur kategori lewat modal Kelola -- form Link Eksternal sendiri
      // tidak punya field kategori (cuma form Digital Product yang punya).
      await page.getByRole("row", { name: new RegExp(name) }).getByRole("button", { name: "Kelola" }).click();
      await page.getByRole("button", { name: "+ Atur kategori" }).click();
      await page.getByPlaceholder("Kategori").fill(category);
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByRole("button", { name: `Kategori: ${category}` })).toBeVisible({ timeout: 5000 });
      await page.getByLabel("Tutup").click();
    }

    await createExternalLinkProduct("Sepatu Lari Merah", "Sepatu");
    await createExternalLinkProduct("Kemeja Putih Polos", "Baju");

    // Aktifkan layout Blok Kategori dari tab Halaman Toko.
    await page.getByRole("button", { name: "Halaman Toko" }).click();
    await page.getByRole("button", { name: "Blok Kategori" }).click();
    await expect(page.getByText(/Pengunjung melihat blok kategori dulu/i)).toBeVisible({ timeout: 5000 });

    // Toko publik: SEBELUM klik blok apa pun, harus tampil blok kategori
    // ("Sepatu"/"Baju" + jumlah produk), BUKAN nama produk individual.
    await expect(async () => {
      await page.goto(`/p/${username}`);
      await expect(page.getByText("Sepatu", { exact: true })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });
    await expect(page.getByText("Baju", { exact: true })).toBeVisible();
    await expect(page.getByText("Sepatu Lari Merah")).toHaveCount(0);
    await expect(page.getByText("Kemeja Putih Polos")).toHaveCount(0);

    // Klik blok "Sepatu" -- HARUS memfilter ke produk kategori itu saja.
    await page.getByText("Sepatu", { exact: true }).click();
    await expect(page.getByText("Sepatu Lari Merah")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Kemeja Putih Polos")).toHaveCount(0);

    // Tab "Semua" (dari renderCategoryTabs yang sudah ada) berfungsi
    // sebagai tombol "kembali" ke tampilan blok kategori.
    await page.getByRole("button", { name: "Semua", exact: true }).click();
    await expect(page.getByText("Sepatu Lari Merah")).toHaveCount(0);
    await expect(page.getByText("Kemeja Putih Polos")).toHaveCount(0);
    await expect(page.getByText("Sepatu", { exact: true })).toBeVisible();
    await expect(page.getByText("Baju", { exact: true })).toBeVisible();
  });
});
