import { test, expect } from "@playwright/test";
import { registerAndLogin, TEST_IMAGE_PNG_BASE64 } from "./fixtures";

// Canvas Page Builder (migrasi 000096, permintaan langsung pengguna 7
// September 2026, dua screenshot Lynk.id) -- Fase 1: Section/Column/Text/
// Button/Divider. Pola sama seperti catalog-nested-blocks.spec.ts: alur
// dashboard penuh lewat UI SUNGGUHAN, lalu verifikasi reload (bukti
// tersimpan di server, bukan cuma state React lokal) & halaman publik.
test.describe("Canvas Page Builder Fase 1", () => {
  test("kreator: Section > Column > Text tersimpan & tampil di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "builder1");
    await page.goto("/dashboard/links");

    await page.getByRole("link", { name: "Buka Mode Builder (Kanvas)" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links\/builder\/main/);
    await expect(page.getByText("Mode Builder")).toBeVisible();

    // Tambah Section di root.
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Komponen" })).toBeVisible();
    await page.getByRole("button", { name: "Bagian", exact: true }).click();
    await expect(page.getByText("Bagian", { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Pilih Section yang baru dibuat -- children-nya kosong, tombol Tambah
    // Komponen sekarang menambah DI DALAM section itu (bukan lagi root).
    await page.getByText("Bagian", { exact: true }).first().click();
    await expect(page.getByText("Komponen baru akan ditambahkan ke dalam blok yang dipilih.")).toBeVisible();

    // Tambah Column di dalam Section.
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Kolom", exact: true }).click();
    await expect(page.getByText("Kolom 1")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Kolom 2")).toBeVisible();

    // Pilih Kolom 1, tambah Text di dalamnya.
    await page.getByText("Kolom 1").click();
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Teks", exact: true }).click();
    // Menambah komponen TIDAK otomatis memilihnya (selection tetap di
    // container induk) -- klik baris barunya di pohon dulu sebelum form
    // edit (textarea) muncul di panel bawah.
    await page.getByRole("button", { name: "Teks", exact: true }).click({ timeout: 10000 });
    await expect(page.getByPlaceholder("Tulis teks di sini...")).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder("Tulis teks di sini...").fill("Halo dari kolom pertama!");
    await page.getByPlaceholder("Tulis teks di sini...").blur();
    await page.waitForTimeout(1000);

    // Reload -- pastikan tersimpan di server (block_data bersarang PATCH
    // ke baris root Section), bukan cuma state lokal.
    await page.reload();
    await expect(page.getByRole("button", { name: "Teks", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Teks", exact: true }).click();
    await expect(page.getByPlaceholder("Tulis teks di sini...")).toHaveValue("Halo dari kolom pertama!", { timeout: 10000 });

    // Halaman publik: Section/Column/Text tampil.
    await page.goto(`/${username}`);
    await expect(page.getByText("Halo dari kolom pertama!")).toBeVisible({ timeout: 10000 });

    // Drag-and-drop DI DALAM SATU kontainer (bukan root): tambah Divider
    // kedua di Kolom 1 (sekarang ada Text lalu Divider), seret Divider ke
    // atas Text -- verifikasi handleReorderChildren (PATCH block_data
    // Section, BUKAN reorderLinks).
    await page.goto(`/dashboard/links/builder/main`);
    await page.getByText("Kolom 1").click();
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Pemisah", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).toBeVisible({ timeout: 10000 });

    const textHandleNested = page.getByRole("button", { name: "Teks", exact: true }).locator("..").getByLabel("Seret untuk mengurutkan");
    const dividerHandleNested = page.getByRole("button", { name: "Pemisah", exact: true }).locator("..").getByLabel("Seret untuk mengurutkan");
    const textBoxBefore = await textHandleNested.boundingBox();
    const dividerBoxBefore = await dividerHandleNested.boundingBox();
    expect(textBoxBefore!.y).toBeLessThan(dividerBoxBefore!.y);

    await page.mouse.move(dividerBoxBefore!.x + dividerBoxBefore!.width / 2, dividerBoxBefore!.y + dividerBoxBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(textBoxBefore!.x + textBoxBefore!.width / 2, textBoxBefore!.y + textBoxBefore!.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const textBoxAfter = await textHandleNested.boundingBox();
    const dividerBoxAfter = await dividerHandleNested.boundingBox();
    expect(dividerBoxAfter!.y).toBeLessThan(textBoxAfter!.y);

    await page.reload();
    await page.getByText("Kolom 1").click();
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).toBeVisible({ timeout: 10000 });
    const dividerBoxReload = await dividerHandleNested.boundingBox();
    const textBoxReload = await textHandleNested.boundingBox();
    expect(dividerBoxReload!.y).toBeLessThan(textBoxReload!.y);

    // Bersihkan Pemisah nested ini sebelum lanjut -- kalau tidak, label
    // "Pemisah" bakal ganda begitu Pemisah ROOT ditambah di bawah.
    await page.getByRole("button", { name: "Pemisah", exact: true }).click();
    await page.getByRole("button", { name: "Hapus blok ini" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).not.toBeVisible();

    // Root-level: Divider & Button (URL wajib diisi di ROOT, beda dari
    // anak tertanam) -- lalu reorder & hapus, lewat endpoint links yang
    // SUDAH ADA (reorderLinks/deleteLink), bukan lib/builder-blocks.ts.
    await page.goto(`/dashboard/links/builder/main`);
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Pemisah", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Tombol", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Tombol", exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Drag-and-drop (@dnd-kit) di level root: seret baris Tombol (paling
    // bawah) ke atas Pemisah -- urutan baru tersimpan lewat reorderLinks
    // (handleReorderRoot, links/builder/[pageId]/page.tsx), BUKAN
    // lib/builder-blocks.ts (itu cuma utk isi Section/Column).
    const pemisahHandle = page.getByRole("button", { name: "Pemisah", exact: true }).locator("..").getByLabel("Seret untuk mengurutkan");
    const tombolHandle = page.getByRole("button", { name: "Tombol", exact: true }).first().locator("..").getByLabel("Seret untuk mengurutkan");
    const pemisahBoxBefore = await pemisahHandle.boundingBox();
    const tombolBoxBefore = await tombolHandle.boundingBox();
    expect(pemisahBoxBefore).not.toBeNull();
    expect(tombolBoxBefore).not.toBeNull();
    // Sebelum drag: Pemisah ditambah duluan, jadi tampil DI ATAS Tombol.
    expect(pemisahBoxBefore!.y).toBeLessThan(tombolBoxBefore!.y);

    await page.mouse.move(tombolBoxBefore!.x + tombolBoxBefore!.width / 2, tombolBoxBefore!.y + tombolBoxBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(pemisahBoxBefore!.x + pemisahBoxBefore!.width / 2, pemisahBoxBefore!.y + pemisahBoxBefore!.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Sesudah drag: Tombol sekarang DI ATAS Pemisah.
    const pemisahBoxAfter = await pemisahHandle.boundingBox();
    const tombolBoxAfter = await tombolHandle.boundingBox();
    expect(tombolBoxAfter!.y).toBeLessThan(pemisahBoxAfter!.y);

    // Reload -- urutan baru tersimpan di server (reorderLinks), bukan
    // cuma state lokal.
    await page.reload();
    await expect(page.getByRole("button", { name: "Tombol", exact: true }).first()).toBeVisible({ timeout: 10000 });
    const pemisahBoxReload = await pemisahHandle.boundingBox();
    const tombolBoxReload = await tombolHandle.boundingBox();
    expect(tombolBoxReload!.y).toBeLessThan(pemisahBoxReload!.y);

    // Hapus blok Pemisah root (lewat deleteLink yang sudah ada).
    await page.getByRole("button", { name: "Pemisah", exact: true }).click();
    await page.getByRole("button", { name: "Hapus blok ini" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).not.toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Tombol", exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).not.toBeVisible();
  });

  // Fase 2 (permintaan langsung pengguna 8 September 2026): 6 tipe
  // komponen baru -- Video/FAQ/Image/Image Grid (alias "gallery")/Video+
  // Foto/Embed Link. Skenario KUNCI yang secara eksplisit diminta plan:
  // upload foto ke blok "Image" di ROOT, LALU ke blok "Image" DI DALAM
  // sebuah Column bersarang di dalam Section (path-walking backend BARU,
  // resolveBuilderBlockData, links.go) -- pastikan keduanya tersimpan ke
  // path yang benar (tidak salah taruh ke sibling/parent), reload, cek
  // halaman publik. `data-builder-block-type`/`data-builder-node-id` (JSX
  // atribut yang sudah ada di PagePreview.tsx) dipakai sebagai selector
  // publik yang presisi -- lebih andal daripada menghitung `<img>` polos.
  test("kreator: Video/FAQ/Image/Gallery/Video+Foto/Embed Link, upload root & bersarang tersimpan benar", async ({ page }) => {
    const { username } = await registerAndLogin(page, "builder2");
    await page.goto("/dashboard/links");
    await page.getByRole("link", { name: "Buka Mode Builder (Kanvas)" }).click();
    await expect(page.getByText("Mode Builder")).toBeVisible();

    // addComponent -- klik tile modal lewat getByLabel (aria-label PERSIS
    // nama tipe, BuilderAddComponentModal.tsx), BUKAN getByRole("button",
    // {name}) -- tree row punya accessible name yang SAMA lewat teks
    // biasa (tanpa aria-label), jadi begitu ada blok dgn label yang sama
    // ditambah lebih dari sekali (mis. "Foto" root+bersarang di test ini),
    // getByRole("button") akan ambigu antara tile modal & baris pohon yang
    // SUDAH ADA. getByLabel HANYA mencocokkan aria-label, jadi selalu unik
    // ke tile modal berapa pun banyaknya baris pohon berlabel sama.
    async function addComponent(label: string) {
      await page.getByRole("button", { name: "Tambah Komponen" }).click();
      await page.getByPlaceholder("Cari komponen").fill(label);
      await page.getByLabel(label, { exact: true }).click();
    }

    // ---- ROOT: "Video" -- isi URL YouTube ----
    await addComponent("Video");
    await expect(page.getByRole("button", { name: "Video", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Video", exact: true }).last().click();
    await page.getByPlaceholder("Tautan YouTube atau TikTok").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByPlaceholder("Tautan YouTube atau TikTok").blur();
    await page.waitForTimeout(700);

    // ---- ROOT: "FAQ" -- satu pertanyaan ----
    await addComponent("FAQ");
    await expect(page.getByRole("button", { name: "FAQ", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "FAQ", exact: true }).last().click();
    await page.getByText("Tambah Pertanyaan").click();
    await page.getByPlaceholder("Pertanyaan").fill("Apa ini?");
    await page.getByPlaceholder("Jawaban").fill("Ini FAQ builder Fase 2.");
    await page.getByPlaceholder("Jawaban").blur();
    await page.waitForTimeout(700);

    // ---- ROOT: "Foto" (image) -- upload foto tunggal ----
    await addComponent("Foto");
    await expect(page.getByRole("button", { name: "Foto", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Foto", exact: true }).last().click();
    await page.getByText("Unggah Foto").waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "root-image.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("Ganti Foto")).toBeVisible({ timeout: 15000 });

    // ---- ROOT: "Video + Foto" -- URL video + foto ----
    await addComponent("Video + Foto");
    await expect(page.getByRole("button", { name: "Video + Foto", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Video + Foto", exact: true }).last().click();
    await page.getByPlaceholder("Tautan YouTube atau TikTok").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByPlaceholder("Tautan YouTube atau TikTok").blur();
    await page.getByText("Unggah Foto").waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "video-image.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("Ganti Foto")).toBeVisible({ timeout: 15000 });

    // ---- ROOT: "Embed Link" -- judul/url/deskripsi + thumbnail ----
    await addComponent("Embed Link");
    await expect(page.getByRole("button", { name: "Embed Link", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Embed Link", exact: true }).last().click();
    await page.getByPlaceholder("Judul kartu").fill("Kartu Embed");
    await page.getByPlaceholder("https://... (opsional)").fill("https://example.com/promo");
    await page.getByPlaceholder("Deskripsi singkat (opsional)").fill("Deskripsi embed link.");
    await page.getByPlaceholder("Deskripsi singkat (opsional)").blur();
    await page.waitForTimeout(700);

    // ---- ROOT: "Image Grid" (alias block_type "gallery") -- 1 foto ----
    await addComponent("Image Grid");
    await expect(page.getByRole("button", { name: "Image Grid", exact: true })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Image Grid", exact: true }).last().click();
    await expect(page.getByText("0/9")).toBeVisible({ timeout: 10000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "gallery1.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("1/9")).toBeVisible({ timeout: 15000 });

    // ---- Section > Column > Foto (bersarang) -- skenario KUNCI plan ----
    await addComponent("Bagian");
    await expect(page.getByText("Bagian", { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await page.getByText("Bagian", { exact: true }).first().click();

    await addComponent("Kolom");
    await expect(page.getByText("Kolom 1")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Kolom 2")).toBeVisible();

    // Kolom 1: tambah Foto (jadi occurrence ke-2 label "Foto" di pohon),
    // UNGGAH foto.
    await page.getByText("Kolom 1").click();
    await addComponent("Foto");
    await expect(page.getByRole("button", { name: "Foto", exact: true }).nth(1)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Foto", exact: true }).nth(1).click();
    await page.getByText("Unggah Foto").waitFor({ state: "visible", timeout: 10000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "nested-image.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("Ganti Foto")).toBeVisible({ timeout: 15000 });

    // Kolom 2: tambah Foto juga (occurrence ke-3), TAPI JANGAN unggah --
    // kontrol isolasi sibling (harus tetap "Unggah Foto" terus, tidak
    // boleh ketiban image_url dari Kolom 1 lewat resolveBuilderBlockData
    // yang salah jalan).
    await page.getByText("Kolom 2").click();
    await addComponent("Foto");
    await expect(page.getByRole("button", { name: "Foto", exact: true }).nth(2)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Foto", exact: true }).nth(2).click();
    await expect(page.getByText("Unggah Foto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Ganti Foto")).not.toBeVisible();

    // ---- Reload -- pastikan semuanya tersimpan di server ----
    await page.reload();
    await expect(page.getByRole("button", { name: "Video", exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Urutan DOM: Foto(root)=nth(0), Kolom1>Foto=nth(1), Kolom2>Foto=nth(2)
    // -- ROOT & Section keduanya di-render mengembang penuh secara bawaan
    // (collapsed kosong di awal), jadi ketiganya SEKALIGUS ada di pohon
    // tanpa perlu klik expand manual.
    await page.getByRole("button", { name: "Foto", exact: true }).nth(0).click();
    await expect(page.getByText("Ganti Foto")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Foto", exact: true }).nth(1).click();
    await expect(page.getByText("Ganti Foto")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Foto", exact: true }).nth(2).click();
    await expect(page.getByText("Unggah Foto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Ganti Foto")).not.toBeVisible();

    // ---- Halaman publik: verifikasi render + isolasi sibling ----
    await page.goto(`/${username}`);
    await expect(page.locator('iframe[src*="youtube.com/embed"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Apa ini?")).toBeVisible();
    await expect(page.getByText("Kartu Embed")).toBeVisible();

    // Tepat 2 blok "image" dengan foto (root + Kolom 1), tepat 1 blok
    // "image" TANPA foto (Kolom 2, placeholder div bukan <img>) -- bukti
    // path-walking upload TIDAK bocor ke sibling/parent yang salah.
    await expect(page.locator('img[data-builder-block-type="image"]')).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator('div[data-builder-block-type="image"]')).toHaveCount(1);

    // Gallery (Image Grid) & Video+Foto sama-sama tampil dengan foto.
    await expect(page.locator('[data-builder-block-type="gallery"] img')).toHaveCount(1);
    await expect(page.locator('[data-builder-block-type="video_image"] img')).toHaveCount(1);
  });
});
