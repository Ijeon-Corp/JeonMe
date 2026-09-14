import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, registerAndLogin } from "./fixtures";

// Item katalog "referensi hidup" ke produk -- permintaan langsung pengguna,
// 14 September 2026, dari screenshot editor katalog: "di dalam blok
// katalog kita tidak mengisi item title, description ataupun photo semua
// diisi berdasarkan blok yang kita pilih... contoh gini katalog barang
// tokopedia -> blok product menampilkan semua product saya". Dikonfirmasi
// lewat AskUserQuestion: begitu item punya blok "produk" tertanam, field
// title/description/photo MANUAL disembunyikan total -- nama/harga/sampul
// yang tampil (grid maupun detail) SELALU diambil ulang dari data produk
// TERKINI (BlockDrilldownEditor.tsx's linkedProduct, PagePreview.tsx's
// findCatalogLinkedProduct), bukan salinan statis -- kalau produk diedit
// lagi nanti, katalog ikut berubah otomatis tanpa perlu disinkronkan
// manual, sama seperti katalog produk Tokopedia.
test.describe("Katalog: item referensi hidup ke produk", () => {
  test("field manual tersembunyi begitu produk ditautkan, grid & detail publik ikut data produk terkini", async ({ page, request }) => {
    const { username } = await registerAndLogin(page, "catliveref");

    // 1) Buat produk "Link Eksternal" (paling ringan -- cuma butuh sampul +
    // tautan, lihat catatan lengkap di products-category-layout.spec.ts).
    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Produk" }).click();
    await page.getByRole("button", { name: "Tambah Produk" }).first().click();
    await page.getByRole("button", { name: "Link Eksternal" }).click();
    const form = page.locator("form", { has: page.getByPlaceholder("Nama produk") });
    await form.getByPlaceholder("Nama produk").fill("Sepatu Lari Merah");
    await form.getByPlaceholder(/Tautan produk/).fill("https://shopee.co.id/sepatu-lari-merah");
    await form
      .locator('input[type="file"]')
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await form.getByRole("button", { name: "Buat Produk" }).click();
    await expect(page.getByRole("row", { name: /Sepatu Lari Merah/ })).toBeVisible({ timeout: 10000 });

    // 2) Buat blok Katalog + 1 item -- SEBELUM ditautkan ke produk apa pun,
    // field title/description/photo manual harus ada seperti biasa.
    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Lanjutan", exact: true }).click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder("Judul blok").fill("Toko Sepatu");
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("Judul item baru (mis. Tipe 36)").fill("Item Sepatu 1");
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Foto", { exact: true })).toBeVisible();

    // 3) Tambah blok "Produk" tertanam, pilih produk yang baru dibuat.
    await page.getByRole("button", { name: "Produk", exact: true }).click();
    await page.getByRole("button", { name: /Sepatu Lari Merah/ }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // 4) Sekarang field title/description/photo manual HARUS hilang total,
    // ganti info ringkas "Terhubung ke produk".
    await expect(page.getByText("Terhubung ke produk")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Foto", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Sepatu Lari Merah")).toBeVisible();

    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // 5) Halaman publik: tile grid katalog ikut nama & sampul PRODUK (bukan
    // title/images statis item yang tidak pernah diisi).
    await page.goto(`/${username}`);
    await page.getByRole("button", { name: "Toko Sepatu" }).click();
    const tile = page.getByRole("button", { name: "Sepatu Lari Merah" });
    await expect(tile).toBeVisible({ timeout: 10000 });
    await expect(tile.locator("img")).toHaveCount(1);

    await tile.click();
    // Detail: header pakai nama produk, kartu produk asli tertanam via
    // blocks[] (Link Eksternal -> tombol "Lihat Produk") -- BUKAN header
    // generik + kartu terpisah yang redundan.
    await expect(page.getByRole("heading", { name: "Sepatu Lari Merah" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Lihat Produk/ })).toBeVisible();

    // 6) Ubah nama produk LANGSUNG lewat API (menu Produk dashboard belum
    // punya UI edit-nama -- ManageProductModal.tsx cuma expose kategori/
    // flash-sale/dst, walau backend product.go's Update sudah mendukung
    // field `name`) -> pastikan katalog ikut berubah OTOMATIS, membuktikan
    // ini benar "referensi hidup", bukan salinan statis saat item dibuat.
    const token = await page.evaluate(() => localStorage.getItem("jeonme_token"));
    const listRes = await request.get("http://localhost:8080/api/v1/dashboard/products", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const products = await listRes.json();
    const product = (products.products ?? products).find((p: { name: string }) => p.name === "Sepatu Lari Merah");
    expect(product).toBeTruthy();
    const patchRes = await request.patch(`http://localhost:8080/api/v1/dashboard/products/${product.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: "Sepatu Lari Biru Edisi Baru" },
    });
    expect(patchRes.ok()).toBeTruthy();

    await page.goto(`/${username}`);
    await page.getByRole("button", { name: "Toko Sepatu" }).click();
    await expect(page.getByRole("button", { name: "Sepatu Lari Biru Edisi Baru" })).toBeVisible({ timeout: 10000 });
  });
});
