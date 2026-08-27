import { test, expect } from "@playwright/test";
import { registerAndLogin, grantPremium } from "./fixtures";

test.describe("Catalog nested blocks", () => {
  test("free user: dapat menambahkan blok tertanam (teks/faq/video/maps) tapi katalog bersarang terkunci", async ({ page }) => {
    const { username } = await registerAndLogin(page, "catfree");
    await page.goto("/dashboard/links");

    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder("Judul blok").fill("Perumahan");
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 10000 });

    // Tambah item
    await page.getByPlaceholder("Judul item baru (mis. Tipe 36)").fill("Perumahan Tipe A");
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toBeVisible({ timeout: 5000 });

    // "Katalog (bersarang)" harus terlihat sebagai locked/Premium
    const catalogTile = page.getByRole("button", { name: /Katalog \(bersarang\)/ });
    await expect(catalogTile).toBeVisible();
    await expect(catalogTile.getByText("Premium")).toBeVisible();

    // Tambah blok Teks
    await page.getByRole("button", { name: "Teks", exact: true }).click();
    await expect(page.getByPlaceholder("Isi teks")).toBeVisible();
    await page.getByPlaceholder("Isi teks").fill("Deskripsi lengkap tipe rumah ini.");
    await page.getByPlaceholder("Isi teks").blur();

    // Tambah blok Video
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(page.getByPlaceholder("URL video YouTube/TikTok")).toBeVisible();
    await page.getByPlaceholder("URL video YouTube/TikTok").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByPlaceholder("URL video YouTube/TikTok").blur();

    // Tambah blok Maps
    await page.getByRole("button", { name: "Lokasi", exact: true }).click();
    await expect(page.getByPlaceholder("Tautan Google Maps")).toBeVisible();
    await page.getByPlaceholder("Tautan Google Maps").fill("https://maps.google.com/");
    await page.getByPlaceholder("Tautan Google Maps").blur();

    // Tambah blok FAQ
    await page.getByRole("button", { name: "FAQ", exact: true }).click();
    await expect(page.getByPlaceholder("Pertanyaan")).toBeVisible();
    await page.getByPlaceholder("Pertanyaan").fill("Apakah bisa nego harga?");
    await page.getByPlaceholder("Jawaban").fill("Bisa, hubungi kami langsung.");
    await page.getByPlaceholder("Jawaban").blur();
    await page.waitForTimeout(1500);

    // Reload -- pastikan semua blok tersimpan (bukan cuma UI lokal)
    await page.reload();
    await expect(page.getByPlaceholder("Isi teks")).toHaveValue("Deskripsi lengkap tipe rumah ini.", { timeout: 10000 });
    await expect(page.getByPlaceholder("URL video YouTube/TikTok")).toHaveValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await expect(page.getByPlaceholder("Tautan Google Maps")).toHaveValue("https://maps.google.com/");
    await expect(page.getByPlaceholder("Pertanyaan")).toHaveValue("Apakah bisa nego harga?");

    // Klik tile "Katalog (bersarang)" -> redirect ke halaman langganan (gerbang UI)
    await page.getByRole("button", { name: /Katalog \(bersarang\)/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/subscription/);

    // Verifikasi tampilan publik: klik ke item lihat blok tertanam
    await page.goto(`/${username}`);
    await page.getByText("Perumahan", { exact: true }).click();
    await page.getByText("Perumahan Tipe A", { exact: true }).click();
    await expect(page.getByText("Deskripsi lengkap tipe rumah ini.")).toBeVisible();
    await expect(page.getByText("Apakah bisa nego harga?")).toBeVisible();
  });

  test("free user dipaksa lewat API: backend menolak nested catalog dengan 403", async ({ page, request }) => {
    await registerAndLogin(page, "catapi");
    const token = await page.evaluate(() => localStorage.getItem("jeonme_token"));
    const createRes = await request.post("http://localhost:8080/api/v1/dashboard/blocks", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        block_type: "catalog",
        title: "Perumahan",
        block_data: {
          items: [
            {
              id: "item-1",
              title: "Tipe A",
              blocks: [{ id: "nested-1", block_type: "catalog", title: "Sub Katalog", block_data: { items: [] } }],
            },
          ],
        },
      },
    });
    expect(createRes.status()).toBe(403);
    const body = await createRes.json();
    expect(body.error).toContain("Premium");
  });

  test("premium user: bisa menaruh blok katalog di dalam item (nesting bertambah dalam)", async ({ page }) => {
    const { username } = await registerAndLogin(page, "catprem");
    grantPremium(username);
    await page.goto("/dashboard/links");
    await page.reload();

    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder("Judul blok").fill("Perumahan");
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Judul item baru (mis. Tipe 36)").fill("Perumahan Tipe A");
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toBeVisible({ timeout: 5000 });

    const catalogTile = page.getByRole("button", { name: /Katalog \(bersarang\)/ });
    await expect(catalogTile.getByText("Premium")).toHaveCount(0);
    await catalogTile.click();

    // Blok tertanam baru berjudul default "Katalog (bersarang)" -- ganti
    // supaya lebih bermakna & gampang dicek di halaman publik nanti.
    await page.getByLabel("Judul blok tertanam").fill("Sub Katalog");
    await page.getByLabel("Judul blok tertanam").blur();

    await page.getByRole("button", { name: "Tambah Item", exact: true }).click();
    await expect(page.getByLabel("Judul item katalog bersarang")).toBeVisible({ timeout: 5000 });
    await page.getByLabel("Judul item katalog bersarang").fill("Unit 1");
    await page.getByLabel("Judul item katalog bersarang").blur();
    await page.waitForTimeout(1500);

    await page.reload();
    await expect(page.getByLabel("Judul item katalog bersarang")).toHaveValue("Unit 1", { timeout: 10000 });

    await page.goto(`/${username}`);
    await page.getByText("Perumahan", { exact: true }).click();
    await page.getByText("Perumahan Tipe A", { exact: true }).click();
    await page.getByText("Sub Katalog", { exact: true }).click();
    await expect(page.getByText("Unit 1", { exact: true })).toBeVisible();

    await page.getByLabel("Kembali").click();
    await expect(page.getByText("Sub Katalog", { exact: true })).toBeVisible();
    await page.getByLabel("Kembali").click();
    await expect(page.getByText("Perumahan Tipe A", { exact: true })).toBeVisible();
  });
});
