import { test, expect, type Page } from "@playwright/test";
import { registerAndLogin, TEST_IMAGE_PNG_BASE64 } from "./fixtures";

// Canvas Page Builder (migrasi 000096, permintaan langsung pengguna 7
// September 2026, dua screenshot Lynk.id) -- REDESAIN TOTAL 10 September
// 2026 (referensi "LYNK"): rute pindah ke /builder/[pageId] (fullscreen,
// lihat app/builder/layout.tsx), arsitektur DRAFT (semua edit blok/desain
// murni lokal, baru benar-benar tersimpan ke server begitu tombol
// "Simpan"/"Simpan & Terbitkan" diklik -- lihat saveDraft di bawah & commitSave,
// app/builder/[pageId]/page.tsx), blok "Teks" jadi rich-text sungguhan
// (RichTextEditor.tsx/TipTap, lihat richTextEditor di bawah). Label baris
// tree SEKARANG SELALU nama tipe generik blok itu (previewLabelFor,
// BuilderLeftPanel.tsx) -- riwayat sempat berubah jadi cuplikan ISI blok
// Teks/FAQ/List/Gallery/Image Slider begitu terisi (10 & 12 September
// 2026), tapi 13 September 2026 dikembalikan permanen ke nama tipe
// generik utk SEMUA tipe termasuk Teks ("nama nama blok ini harusnya itu
// nama tiap blok bukan nama tiap isi dari blok") -- lihat komentar
// lengkap di previewLabelFor sebelum mengubah lagi. Pengecualian: upload
// gambar (foto/gallery) TETAP langsung ke server terlepas status draft
// (ensureRootPersisted meng-create root yang masih "temp-..." secara diam-
// diam kalau perlu) -- jadi bagian test yang upload lalu langsung reload
// TETAP valid tanpa perlu Simpan dulu, tapi edit TEKS/judul/url/reorder/
// hapus WAJIB diikuti Simpan sebelum reload/pindah ke halaman publik,
// kalau tidak datanya hilang.
//
// Pola dasar test TIDAK berubah dari sebelumnya: alur dashboard penuh lewat
// UI SUNGGUHAN, verifikasi reload (bukti tersimpan di server, bukan cuma
// state React lokal) & halaman publik.

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Perubahan tersimpan.")).toBeVisible({ timeout: 15000 });
}

// richTextEditor -- blok "Teks" sekarang rich-text (TipTap,
// RichTextEditor.tsx): area contenteditable TANPA placeholder HTML biasa
// (beda dari <textarea placeholder="Tulis teks di sini..."> lama) --
// SATU-SATUNYA elemen contenteditable di seluruh halaman builder (accordion
// cuma satu blok terbuka sekaligus), aman dicari tanpa scoping tambahan.
function richTextEditor(page: Page) {
  return page.locator('[contenteditable="true"]');
}

// deleteBlock -- Fase 8 (12 September 2026) memindahkan "Hapus blok ini"
// ke dalam menu "..." per-baris (duplicate/delete), BUKAN lagi tombol
// langsung tampil begitu blok dipilih -- klik dulu tombol "Menu blok"
// (aria-label, SATU per baris tree) tepat di sebelah baris berlabel
// `label`, baru "Hapus blok ini" muncul di dropdown-nya. Audit 13
// September 2026 (C9) menambah `role="menu"`/`role="menuitem"` eksplisit
// ke dropdown ini (pola ARIA menu-button baku) -- role EKSPLISIT itu
// menimpa role implisit "button" bawaan elemen <button>, jadi item di
// dalamnya sekarang dicari lewat role "menuitem", bukan "button" lagi.
async function deleteBlock(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).locator("..").getByLabel("Menu blok").click();
  await page.getByRole("menuitem", { name: "Hapus blok ini" }).click();
}

test.describe("Canvas Page Builder", () => {
  test("kreator: Section > Column > Text tersimpan & tampil di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "builder1");
    await page.goto("/dashboard/links");

    await page.getByRole("link", { name: "Buka Mode Builder (Kanvas)" }).click();
    await expect(page).toHaveURL(/\/builder\/main/);
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
    // container induk) -- klik baris barunya di pohon dulu sebelum editor
    // rich-text muncul IN-PLACE (accordion, redesain total 10 September
    // 2026). Baris blok Teks berlabel "Teks" (nama tipe generik,
    // previewLabelFor) baik kosong maupun sudah terisi -- lihat catatan di
    // atas file ini soal riwayat perubahan label ini.
    await page.getByRole("button", { name: "Teks", exact: true }).click({ timeout: 10000 });
    await richTextEditor(page).click();
    await page.keyboard.type("Halo dari kolom pertama!");
    // Draft SEKARANG murni lokal -- tekan Simpan & tunggu toast sukses
    // sebelum reload, kalau tidak perubahan hilang (redesain arsitektur
    // draft, 10 September 2026).
    await saveDraft(page);

    // Reload -- pastikan tersimpan di server (block_data bersarang di baris
    // root Section), bukan cuma state lokal. Label baris pohon TETAP "Teks"
    // (nama tipe generik), bukan cuplikan isi teksnya.
    await page.reload();
    const textRow = page.getByRole("button", { name: "Teks", exact: true });
    await expect(textRow).toBeVisible({ timeout: 10000 });
    await textRow.click();
    await expect(richTextEditor(page)).toHaveText("Halo dari kolom pertama!", { timeout: 10000 });

    // Halaman publik: Section/Column/Text tampil.
    await page.goto(`/${username}`);
    await expect(page.getByText("Halo dari kolom pertama!")).toBeVisible({ timeout: 10000 });

    // Drag-and-drop DI DALAM SATU kontainer (bukan root): tambah Divider
    // kedua di Kolom 1 (sekarang ada Text lalu Divider), seret Divider ke
    // atas Text -- verifikasi handleReorderChildren (mutasi draft block_data
    // Section, BUKAN reorderLinks) -- reorder ini draft lokal juga, perlu
    // Simpan sebelum reload.
    await page.goto(`/builder/main`);
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

    await saveDraft(page);
    await page.reload();
    await page.getByText("Kolom 1").click();
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).toBeVisible({ timeout: 10000 });
    const dividerBoxReload = await dividerHandleNested.boundingBox();
    const textBoxReload = await textHandleNested.boundingBox();
    expect(dividerBoxReload!.y).toBeLessThan(textBoxReload!.y);

    // Bersihkan Pemisah nested ini sebelum lanjut -- kalau tidak, label
    // "Pemisah" bakal ganda begitu Pemisah ROOT ditambah di bawah. Simpan
    // dulu supaya penghapusan ini benar-benar tersimpan sebelum navigasi
    // penuh (page.goto) di bawah membaca ulang dari server.
    await deleteBlock(page, "Pemisah");
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).not.toBeVisible();
    await saveDraft(page);

    // Root-level: Divider & Button (URL wajib diisi di ROOT, beda dari
    // anak tertanam) -- lalu reorder & hapus, lewat endpoint links yang
    // SUDAH ADA (reorderLinks/deleteLink dipanggil commitSave saat Simpan
    // ditekan), bukan lib/builder-blocks.ts.
    await page.goto(`/builder/main`);
    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Pemisah", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await page.getByRole("button", { name: "Tombol", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Tombol", exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Drag-and-drop (@dnd-kit) di level root: seret baris Tombol (paling
    // bawah) ke atas Pemisah -- urutan baru disimpan lewat reorderLinks
    // saat Simpan ditekan (commitSave, app/builder/[pageId]/page.tsx),
    // BUKAN lib/builder-blocks.ts (itu cuma utk isi Section/Column).
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
    await saveDraft(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Tombol", exact: true }).first()).toBeVisible({ timeout: 10000 });
    const pemisahBoxReload = await pemisahHandle.boundingBox();
    const tombolBoxReload = await tombolHandle.boundingBox();
    expect(tombolBoxReload!.y).toBeLessThan(pemisahBoxReload!.y);

    // Hapus blok Pemisah root (lewat deleteLink saat Simpan ditekan).
    await deleteBlock(page, "Pemisah");
    await expect(page.getByRole("button", { name: "Pemisah", exact: true })).not.toBeVisible();
    await saveDraft(page);

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
    // Jawaban FAQ -- rich text (susulan 12 September 2026), tidak lagi
    // input placeholder "Jawaban" biasa -- lihat FaqItemsEditor,
    // BuilderLeftPanel.tsx. Satu-satunya contenteditable di titik ini.
    await richTextEditor(page).click();
    await page.keyboard.type("Ini FAQ builder Fase 2.");
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
    // "Judul kartu" -- redesain panel blok (13 September 2026, benchmark
    // Linktree, Tahap 2/3): label TETAP di atas field (FormField.tsx)
    // menggantikan placeholder lama, jadi dicari lewat getByLabel sekarang.
    await page.getByLabel("Judul kartu").fill("Kartu Embed");
    await page.getByPlaceholder("https://... (opsional)").fill("https://example.com/promo");
    // Deskripsi Embed Link -- rich text (susulan 12 September 2026), tidak
    // lagi input placeholder "Deskripsi singkat (opsional)" biasa -- lihat
    // BuilderLeftPanel.tsx blok "embed_link". Satu-satunya contenteditable
    // di titik ini.
    await richTextEditor(page).click();
    await page.keyboard.type("Deskripsi embed link.");
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
    // yang salah jalan). Blok ini TIDAK PERNAH diunggah fotonya, jadi
    // TIDAK auto-persisted lewat ensureRootPersisted -- murni draft, wajib
    // ikut Simpan (lihat di bawah) supaya tetap ada setelah reload.
    await page.getByText("Kolom 2").click();
    await addComponent("Foto");
    await expect(page.getByRole("button", { name: "Foto", exact: true }).nth(2)).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Foto", exact: true }).nth(2).click();
    await expect(page.getByText("Unggah Foto")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Ganti Foto")).not.toBeVisible();

    // ---- Simpan -- WAJIB sebelum reload (redesain arsitektur draft, 10
    // September 2026): Video/FAQ/Embed Link TIDAK PERNAH diupload fotonya,
    // jadi TIDAK auto-persisted lewat ensureRootPersisted seperti Foto/
    // Video+Foto/Image Grid -- tanpa Simpan, ketiganya (dan Foto Kolom 2
    // yang tanpa upload) akan LENYAP begitu reload (masih id "temp-...").
    await saveDraft(page);

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
    // Pola thumbnail-klik-buka (susulan 14 September 2026, benchmark
    // Linktree "opens out from the link and plays natively") -- iframe
    // TIDAK PERNAH langsung aktif lagi sejak page load, klik tombol Putar
    // dulu (VideoEmbedBlock.tsx) sebelum iframe sungguhan dimuat.
    await page.getByRole("button", { name: /Putar video/ }).first().click();
    await expect(page.locator('iframe[src*="youtube.com/embed"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Apa ini?")).toBeVisible();
    await expect(page.getByText("Kartu Embed")).toBeVisible();

    // Tepat 2 blok "image" dengan foto (root + Kolom 1), tepat 1 blok
    // "image" TANPA foto (Kolom 2, placeholder div bukan <img>) -- bukti
    // path-walking upload TIDAK bocor ke sibling/parent yang salah.
    // Selector "[data-builder-block-type=image] img" (descendant, BUKAN
    // lagi "img[data-builder-block-type=image]") -- susulan 14 September
    // 2026 (link tujuan opsional + caption utk blok "image"): <img> SEKARANG
    // dibungkus <div data-builder-block-type="image"> (+ caption di
    // sebelahnya, kadang dibungkus <a> kalau ada link), atribut tidak lagi
    // menempel LANGSUNG di <img> itu sendiri -- pola yang SAMA PERSIS sudah
    // dipakai video_image (baris di bawah), sekarang "image" konsisten juga.
    await expect(page.locator('[data-builder-block-type="image"] img')).toHaveCount(2, { timeout: 10000 });
    await expect(page.locator('div[data-builder-block-type="image"]:not(:has(img))')).toHaveCount(1);

    // Gallery (Image Grid) & Video+Foto sama-sama tampil dengan foto.
    await expect(page.locator('[data-builder-block-type="gallery"] img')).toHaveCount(1);
    // "> img" (direct child, BUKAN lagi descendant polos) -- susulan 14
    // September 2026 (pola thumbnail-klik-buka blok Video): VideoEmbedBlock
    // SEKARANG juga merender <img> (thumbnail YouTube di dalam tombol
    // Putar) sebagai descendant blok "video_image" ini -- descendant polos
    // akan menghitung DUA <img> (foto asli blok + thumbnail video),
    // padahal assertion ini cuma peduli foto ASLI yang diunggah kreator
    // (direct child dari wrapper, lihat case "video_image" PagePreview.tsx).
    await expect(page.locator('[data-builder-block-type="video_image"] > img')).toHaveCount(1);
  });

  // Fase 3 (permintaan langsung pengguna 8 September 2026): Countdown,
  // "Card/List/Testimony" (satu block_type fleksibel "list", dikonfirmasi
  // via AskUserQuestion), Image Slider (alias validasi/upload "gallery"),
  // Embed generik (iframe+whitelist provider), promosi "maps" (ROOT-ONLY).
  // Skenario kunci BEDA dari Fase 1/2: CSP frame-src (next.config.js)
  // WAJIB diuji nyata (bukan cuma baca kode) -- provider baru (Calendly/
  // Google Forms/Spotify) yang lupa ditambah ke allowlist akan gagal
  // SENYAP di browser (iframe kosong, tanpa error JS), cuma kelihatan
  // lewat console CSP violation -- lihat catatan lengkap di plan soal pola
  // bug ini sudah 2x terjadi sebelumnya (video, lalu maps).
  test("kreator: Countdown/List-Testimoni/Image Slider/Embed/Maps root tersimpan & tampil di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "builder3");
    await page.goto("/dashboard/links");
    await page.getByRole("link", { name: "Buka Mode Builder (Kanvas)" }).click();
    await expect(page.getByText("Mode Builder")).toBeVisible();

    async function addComponent(label: string) {
      await page.getByRole("button", { name: "Tambah Komponen" }).click();
      await page.getByPlaceholder("Cari komponen").fill(label);
      await page.getByLabel(label, { exact: true }).click();
    }
    function treeRow(label: string) {
      return page
        .locator("div.flex.items-center.gap-1.rounded-lg")
        .filter({ has: page.getByLabel("Seret untuk mengurutkan") })
        .filter({ hasText: new RegExp(`^${label}$`) });
    }

    // ---- Countdown ----
    await addComponent("Countdown");
    await expect(treeRow("Countdown")).toBeVisible({ timeout: 10000 });
    await treeRow("Countdown").click();
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const localValue = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T12:00`;
    const dtInput = page.locator('input[type="datetime-local"]');
    await dtInput.fill(localValue);
    await dtInput.blur();
    await page.waitForTimeout(700);

    // ---- List (gaya Testimoni) ----
    await addComponent("Card/List/Testimoni");
    await expect(treeRow("Card/List/Testimoni")).toBeVisible({ timeout: 10000 });
    await treeRow("Card/List/Testimoni").click();
    await page.getByRole("button", { name: "Testimoni", exact: true }).click();
    await page.waitForTimeout(700); // ganti style ke draft lokal -- tunggu re-render sebelum Tambah Item (butuh style testimony utk placeholder "Nama").
    await page.getByRole("button", { name: "Tambah Item" }).click();
    await page.waitForTimeout(700);
    await page.getByPlaceholder("Nama").fill("Budi Santoso");
    // Kutipan/testimoni -- rich text (susulan 12 September 2026), tidak lagi
    // input placeholder biasa -- lihat ListItemsEditor.tsx. Satu-satunya
    // contenteditable di titik ini.
    await richTextEditor(page).click();
    await page.keyboard.type("Produk ini sangat membantu bisnis saya!");
    await page.getByPlaceholder("Peran/perusahaan (opsional)").fill("CEO, Budi Corp");
    await page.getByPlaceholder("Peran/perusahaan (opsional)").blur();
    await page.waitForTimeout(700);

    // ---- Image Slider (alias upload "gallery") ----
    await addComponent("Image Slider");
    await expect(treeRow("Image Slider")).toBeVisible({ timeout: 10000 });
    await treeRow("Image Slider").click();
    await expect(page.getByText("0/9")).toBeVisible({ timeout: 10000 });
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "slide1.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("1/9")).toBeVisible({ timeout: 15000 });

    // ---- Embed generik (Calendly) ----
    await addComponent("Embed");
    await expect(treeRow("Embed")).toBeVisible({ timeout: 10000 });
    await treeRow("Embed").click();
    await page.getByPlaceholder("Tautan Google Forms, Calendly, atau Spotify").fill("https://calendly.com/some-user/30min");
    await page.getByPlaceholder("Tautan Google Forms, Calendly, atau Spotify").blur();
    await page.waitForTimeout(700);

    // ---- Maps (promosi block_type lama, ROOT-ONLY) ----
    await addComponent("Lokasi/Maps");
    await expect(treeRow("Lokasi/Maps")).toBeVisible({ timeout: 10000 });
    await treeRow("Lokasi/Maps").click();
    await page.getByPlaceholder("Tautan berbagi Google Maps").fill("https://www.google.com/maps/place/Monas/@-6.1753871,106.8249641,17z");
    await page.getByPlaceholder("Tautan berbagi Google Maps").blur();
    await page.getByText("Tampilkan peta interaktif (embed)").click();
    await expect(page.locator('input[type="checkbox"]')).toBeChecked();

    // ---- Simpan -- SEMUA blok di atas draft lokal murni sampai di sini
    // (redesain arsitektur draft, 10 September 2026), KECUALI Image Slider
    // (fotonya sudah auto-persisted lewat ensureRootPersisted saat upload).
    // resolveMapsEmbedCoords (backend) dipanggil begitu blok Maps ini
    // benar-benar dibuat/diperbarui ke server (POST /dashboard/blocks kalau
    // baru pertama kali, PATCH /dashboard/links/:id kalau sudah ada) --
    // toast sukses di bawah cukup jadi bukti resolveMapsEmbedCoords TIDAK
    // gagal (kalau gagal, commitSave akan menampilkan pesan error, bukan
    // toast sukses).
    await saveDraft(page);

    // ---- Reload -- pastikan semuanya tersimpan di server ----
    await page.reload();
    await expect(treeRow("Countdown")).toBeVisible({ timeout: 10000 });
    // List & Image Slider TETAP berlabel nama tipe generik walau sudah
    // terisi -- previewLabelFor, BuilderLeftPanel.tsx (13 September 2026,
    // lihat catatan di atas file ini).
    await expect(treeRow("Card/List/Testimoni")).toBeVisible();
    await expect(treeRow("Image Slider")).toBeVisible();
    await expect(treeRow("Embed")).toBeVisible();
    await expect(treeRow("Lokasi/Maps")).toBeVisible();

    await treeRow("Card/List/Testimoni").click();
    // style "testimony" bertahan setelah reload -- bukti langsung bug
    // merge block_data (handleUpdateNode cabang root) sudah diperbaiki,
    // bukan cuma "items tersimpan" tanpa "style" ikut hilang diam-diam.
    await expect(page.getByRole("button", { name: "Testimoni", exact: true })).toHaveClass(/border-jeon-purple/);
    await expect(page.getByPlaceholder("Nama")).toHaveValue("Budi Santoso", { timeout: 10000 });

    await treeRow("Lokasi/Maps").click();
    // Toggle embed bertahan setelah reload -- bukti field ini benar-benar
    // ikut tersimpan (BUKAN cuma state lokal MapsEditor yang hilang begitu
    // komponen remount, lihat catatan lengkap di MapsEditor, BuilderLeftPanel.tsx).
    await expect(page.locator('input[type="checkbox"]')).toBeChecked();

    // ---- Halaman publik: verifikasi render + CSP frame-src nyata ----
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy|Refused to frame/i.test(msg.text())) {
        cspViolations.push(msg.text());
      }
    });
    await page.goto(`/${username}`);
    await page.waitForTimeout(1500);

    await expect(page.locator('[data-builder-block-type="countdown"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-builder-block-type="list"]')).toContainText("Budi Santoso");
    await expect(page.locator('[data-builder-block-type="list"]')).toContainText("CEO, Budi Corp");
    await expect(page.locator('[data-builder-block-type="image_slider"] img')).toHaveCount(1);
    await expect(page.locator('[data-builder-block-type="maps"]')).toContainText("Lokasi/Maps");

    // Embed: iframe Calendly SUNGGUHAN merender (bukti CSP frame-src
    // mengizinkan calendly.com di halaman publik SUNGGUHAN, TANPA
    // bypassCSP -- default Playwright sudah menegakkan CSP apa adanya).
    const embedIframe = page.locator('[data-builder-block-type="embed"] iframe[src*="calendly.com"]');
    await expect(embedIframe).toBeVisible({ timeout: 10000 });

    // Countdown benar-benar TICKING (bukan render-sekali-lalu-diam) --
    // ambil angka detik dua kali berjarak >=1.2 detik, harus beda.
    const secondsCell = page.locator('[data-builder-block-type="countdown"] p.tabular-nums').last();
    const secondsBefore = await secondsCell.textContent();
    await page.waitForTimeout(1200);
    const secondsAfter = await secondsCell.textContent();
    expect(secondsAfter).not.toBe(secondsBefore);

    expect(cspViolations.filter((v) => /frame-src/i.test(v))).toEqual([]);
  });

  // Bug dilaporkan langsung pengguna, 14 September 2026 (screenshot halaman
  // publik): "kenapa blok katalog nya tidak bisa di klik dan menampilkan
  // isinya". Akar masalah: blok "catalog" akar SENGAJA jatuh ke
  // renderLinkOrBlock (bukan renderBuilderNode, lihat komentar
  // BUILDER_NODE_BLOCK_TYPES di PagePreview.tsx), TAPI BuilderPagePreview
  // (dipakai kanvas Mode Builder MAUPUN halaman publik sungguhan begitu
  // builder_mode="builder") tidak pernah punya state `catalogView` sendiri
  // sama sekali, DAN pemanggilan renderLinkOrBlock di sana tidak pernah
  // mengoper argumen onOpenCatalog -- jadi baris Katalog tampil tapi klik
  // di halaman publik tidak melakukan apa pun, berapa pun page_type-nya
  // (bio/Toko/landing, ketiganya lewat komponen yang sama).
  test("kreator: blok Katalog akar di Mode Builder bisa diklik & menampilkan isinya di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "builder4");
    await page.goto("/dashboard/links");
    await page.getByRole("link", { name: "Buka Mode Builder (Kanvas)" }).click();
    await expect(page.getByText("Mode Builder")).toBeVisible();

    await page.getByRole("button", { name: "Tambah Komponen" }).click();
    await expect(page.getByRole("heading", { name: "Tambah Komponen" })).toBeVisible();
    await page.getByRole("button", { name: "Lainnya", exact: true }).click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();

    // Menambah komponen root-only TIDAK otomatis memilihnya (sama seperti
    // Section/Kolom/dst, lihat catatan "Tambah Komponen" di test pertama
    // file ini) -- klik baris tree-nya dulu baru editor Katalog (JUDUL
    // BLOK/daftar item/"+ Tambah Item") tampil.
    await page.getByRole("button", { name: "Katalog", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Tambah Item" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Tambah Item" }).click();
    await page.getByPlaceholder("mis. Tipe 36").fill("Tipe Rumah A");
    await page.getByPlaceholder("mis. Tipe 36").blur();

    await saveDraft(page);

    await page.goto(`/${username}`);
    const catalogRow = page.getByRole("button", { name: "Katalog", exact: true });
    await expect(catalogRow).toBeVisible({ timeout: 10000 });
    // SEBELUM perbaikan: baris ini disabled (cursor-default opacity-70,
    // tidak ada IconChevronRight) -- klik tidak melakukan apa pun.
    await expect(catalogRow).toBeEnabled();
    await catalogRow.click();
    // "Flatten total" (susulan 15 September 2026): judul item tampil
    // LANGSUNG sbg teks, tanpa tile/klik apa pun lagi.
    await expect(page.getByText("Tipe Rumah A", { exact: true })).toBeVisible({ timeout: 10000 });
  });
});
