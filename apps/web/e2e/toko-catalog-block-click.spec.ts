import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, registerAndLogin } from "./fixtures";

// Bug dilaporkan langsung pengguna, 14 September 2026 (screenshot halaman
// publik: "kenapa blok katalog nya tidak bisa di klik dan menampilkan
// isinya"). Root cause SEBENARNYA ada di 3 tempat sekaligus (PagePreview.tsx
// merender halaman lewat salah satu dari 3 komponen tergantung pageType/
// builderMode) -- layout Bio klasik SUDAH benar (setCatalogView dioper),
// tapi ProdukPagePreview (Toko klasik, komponen ini) dan BuilderPagePreview
// (Mode Builder, lihat builder-mode.spec.ts utk test itu) DUA-DUANYA tidak
// pernah punya state `catalogView` sendiri sama sekali -- blok Katalog
// tampil sbg baris tapi klik tidak melakukan apa pun. Test ini mengunci
// perbaikan jalur Toko klasik (ProdukPagePreview) secara terpisah dari
// jalur Mode Builder.
test("Toko klasik: blok Katalog di root bisa diklik & menampilkan isinya", async ({ page, request }) => {
  const { username } = await registerAndLogin(page, "tokocatclick");

  // Trigger ensureProdukPage (Toko canonical otomatis).
  await page.goto("/dashboard/products");
  await page.getByRole("button", { name: "Produk", exact: true }).click();
  await page.getByRole("button", { name: "Tambah Produk" }).first().click();
  await page.getByRole("button", { name: "Link Eksternal" }).click();
  const form = page.locator("form", { has: page.getByPlaceholder("Nama produk") });
  await form.getByPlaceholder("Nama produk").fill("Produk Pemicu Toko");
  await form.getByPlaceholder(/Tautan produk/).fill("https://shopee.co.id/produk-pemicu");
  await form
    .locator('input[type="file"]')
    .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
  await form.getByRole("button", { name: "Buat Produk" }).click();
  await expect(page.getByRole("row", { name: /Produk Pemicu Toko/ })).toBeVisible({ timeout: 10000 });

  const token = await page.evaluate(() => localStorage.getItem("jeonme_token"));
  const pagesRes = await request.get("http://localhost:8080/api/v1/dashboard/pages", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pages = await pagesRes.json();
  const tokoPage = pages.find((p: { page_type: string }) => p.page_type === "produk");
  expect(tokoPage).toBeTruthy();

  // ProdukPageEditor.tsx (editor klasik Toko) tidak punya tile "Katalog"
  // sama sekali di UI-nya sendiri (lihat catatan lengkap) -- paksa lewat
  // API langsung (backend sudah menerima block_type "catalog" apa pun
  // page_type-nya), sama pola "dipaksa lewat API" yang sudah dipakai
  // catalog-nested-blocks.spec.ts.
  const createRes = await request.post(`http://localhost:8080/api/v1/dashboard/pages/${tokoPage.id}/blocks`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      block_type: "catalog",
      title: "Katalog Toko",
      block_data: { items: [{ id: "item-1", title: "Tipe Rumah A", description: "", images: [] }] },
    },
  });
  expect(createRes.ok()).toBeTruthy();

  await page.goto(`/${username}/produk`);
  const catalogRow = page.getByRole("button", { name: "Katalog Toko", exact: true });
  await expect(catalogRow).toBeVisible({ timeout: 10000 });
  await expect(catalogRow).toBeEnabled();
  await catalogRow.click();
  await expect(page.getByRole("button", { name: "Tipe Rumah A" })).toBeVisible({ timeout: 10000 });
});
