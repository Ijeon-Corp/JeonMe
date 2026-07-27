import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

test.describe("Tautan", () => {
  test("menambah tautan lewat UI, muncul di dashboard & halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "links");
    await publishPage(page);

    await page.goto("/dashboard/links");
    await expect(page.getByRole("heading", { name: "Tautan" })).toBeVisible();

    // Buka modal "Tambah" (CTA utama) lalu pilih tile "Tautan" biasa --
    // role="button" membedakannya dari tautan navigasi sidebar "Tautan"
    // yang role="link".
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Toko Online Saya";
    const linkUrl = "https://example.com/toko";
    await page.getByPlaceholder("Judul tautan").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill(linkUrl);

    // Submit button ada di dalam form yang sama dengan input "Judul tautan"
    // -- dibedakan dari CTA "Tambah" di atasnya yang juga bertuliskan sama.
    const addForm = page.locator("form", { has: page.getByPlaceholder("Judul tautan") });
    await addForm.getByRole("button", { name: "Tambah" }).click();

    // Tautan baru harus muncul di daftar dashboard tanpa perlu reload manual
    // (state lokal diperbarui optimis setelah API sukses). Dibatasi ke
    // getByRole("listitem") -- halaman ini JUGA menampilkan panel pratinjau
    // langsung (LivePreviewPanel) di sebelah kanan yang merender judul yang
    // sama sebagai tautan <a>, getByText polos akan bentrok dengan itu.
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Halaman publik (server component, fetch ISR) -- tunggu sampai jendela
    // cache 60 detik lewat kalau perlu, lalu pastikan tautan benar-benar
    // tampil untuk pengunjung sungguhan, bukan cuma tersimpan di database.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });

    const publicLink = page.getByRole("link", { name: new RegExp(linkTitle) });
    await expect(publicLink).toHaveAttribute("href", linkUrl);
  });

  test("menonaktifkan tautan membuatnya hilang dari halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "toggle");
    await publishPage(page);

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Tautan Nonaktif";
    await page.getByPlaceholder("Judul tautan").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill("https://example.com/nonaktif");
    const addForm = page.locator("form", { has: page.getByPlaceholder("Judul tautan") });
    await addForm.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Cari sakelar aktif/nonaktif pada baris tautan yang baru dibuat lalu
    // matikan -- konfirmasi dulu tampil di publik, baru dimatikan, supaya
    // test benar-benar membuktikan transisi (bukan cuma "memang dari awal
    // tidak tampil").
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });

    await page.goto("/dashboard/links");
    const row = page.locator("li", { hasText: linkTitle }).first();
    await row.getByRole("switch").click();

    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toHaveCount(0);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
