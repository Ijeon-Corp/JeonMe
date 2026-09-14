import { test, expect } from "@playwright/test";
import { registerAndLogin, grantPremium } from "./fixtures";

test.describe("Catalog nested blocks", () => {
  test("free user: dapat menambahkan blok tertanam (teks/faq/video/maps) tapi katalog bersarang terkunci", async ({ page }) => {
    const { username } = await registerAndLogin(page, "catfree");
    await page.goto("/dashboard/links");

    await page.getByRole("button", { name: "Tambah" }).first().click();
    // Modal v2: "Katalog" ada di tab "Lanjutan" ("Populer" adalah tab
    // default, tidak berisi "Katalog").
    await page.getByRole("button", { name: "Lanjutan", exact: true }).click();
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

    // BlockDrilldownEditor (redesain drill-down gaya Linktree, page_builder
    // flag): menambah blok tertanam BUKAN lagi form-semua-terlihat -- klik
    // tile ("Teks"/"Video"/dst) LANGSUNG membuat blok itu DAN pindah masuk
    // ("drill down") ke layar edit blok itu sendiri, menggantikan tile
    // picker. Harus klik "Kembali" dulu tiap kali sebelum tile picker
    // (dan blok yang sudah ada) tampil lagi utk menambah blok berikutnya.

    // Tambah blok Teks -- blok "text" tertanam SEKARANG rich-text (TipTap,
    // commit 4399631 "full parity mode Simple vs Builder"), placeholder
    // <textarea> "Isi teks" lama sudah tidak ada, ganti contenteditable.
    // scheduleTextSave (BlockDrilldownEditor.tsx) debounce 700ms sebelum
    // PATCH sungguhan -- tunggu dulu (pola SAMA PERSIS sudah dipakai utk
    // Jawaban FAQ di bawah) sebelum "Kembali", kalau tidak timer debounce
    // yang masih pending bisa menembak PATCH belakangan & menimpa
    // perubahan blok LAIN yang sudah ditambah sesudahnya (race autosave).
    await page.getByRole("button", { name: "Teks", exact: true }).click();
    const textEditor = page.locator('[contenteditable="true"]');
    await expect(textEditor).toBeVisible();
    await textEditor.click();
    await page.keyboard.type("Deskripsi lengkap tipe rumah ini.");
    await textEditor.blur();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Tambah blok Video
    await page.getByRole("button", { name: "Video", exact: true }).click();
    await expect(page.getByPlaceholder("URL video YouTube/TikTok")).toBeVisible();
    await page.getByPlaceholder("URL video YouTube/TikTok").fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByPlaceholder("URL video YouTube/TikTok").blur();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Tambah blok Maps
    await page.getByRole("button", { name: "Lokasi", exact: true }).click();
    await expect(page.getByPlaceholder("Tautan Google Maps")).toBeVisible();
    await page.getByPlaceholder("Tautan Google Maps").fill("https://maps.google.com/");
    await page.getByPlaceholder("Tautan Google Maps").blur();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Tambah blok FAQ -- beda dari Teks/Video/Lokasi: "FAQ" pindah dulu ke
    // daftar pertanyaan KOSONG (faqList), harus klik "+ Tambah Pertanyaan"
    // baru field Pertanyaan/Jawaban muncul (faqItem) -- makanya butuh DUA
    // "Kembali" utk sampai balik ke frame item (faqItem -> faqList ->
    // catalogItem).
    await page.getByRole("button", { name: "FAQ", exact: true }).click();
    await page.getByRole("button", { name: "+ Tambah Pertanyaan", exact: true }).click();
    await expect(page.getByPlaceholder("Pertanyaan")).toBeVisible();
    await page.getByPlaceholder("Pertanyaan").fill("Apakah bisa nego harga?");
    // Jawaban FAQ tertanam SEKARANG rich-text juga (TipTap, 14 September
    // 2026), placeholder <textarea> "Jawaban" lama sudah tidak ada --
    // pola sama seperti blok "Teks" tertanam di atas (contenteditable +
    // debounce 700ms, blur+wait di sini cuma memastikan timer sempat
    // menembak sebelum navigasi "Kembali", BUKAN pemicu save itu sendiri).
    const embeddedAnswerEditor = page.locator('[contenteditable="true"]');
    await embeddedAnswerEditor.click();
    await page.keyboard.type("Bisa, hubungi kami langsung.");
    await embeddedAnswerEditor.blur();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Reload -- pastikan semua blok tersimpan (bukan cuma UI lokal).
    // BlockDrilldownEditor tertutup TOTAL sesudah reload (drilldownBlockId
    // itu state klien murni) -- navigasi ulang dari awal: baris "Perumahan"
    // -> item -> tiap blok tertanam SATU PER SATU (drill-down tidak
    // menampilkan seluruh isi sekaligus seperti form lama). getByText
    // dipakai (bukan getByRole+name) utk masuk ke blok yang SUDAH ADA --
    // baris blok yang sudah ada py tombol hapus BERSARANG di dalamnya
    // (beda dari tile "tambah baru" yang bersih), .first() mengandalkan
    // urutan DOM (daftar blok yang sudah ada dirender SEBELUM grid tile
    // tambah baru, lihat CatalogItemFrame).
    await page.reload();
    const perumahanRow = page.locator("li", { hasText: "Perumahan" }).first();
    await perumahanRow.getByRole("button", { name: "Edit Konten", exact: true }).click();
    await page.getByRole("button", { name: /Perumahan Tipe A/ }).click();

    await page.getByText("Teks", { exact: true }).first().click();
    await expect(page.locator('[contenteditable="true"]')).toHaveText("Deskripsi lengkap tipe rumah ini.", { timeout: 10000 });
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    await page.getByText("Video", { exact: true }).first().click();
    await expect(page.getByPlaceholder("URL video YouTube/TikTok")).toHaveValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    await page.getByText("Lokasi", { exact: true }).first().click();
    await expect(page.getByPlaceholder("Tautan Google Maps")).toHaveValue("https://maps.google.com/");
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    await page.getByText("FAQ", { exact: true }).first().click();
    await page.getByText("Apakah bisa nego harga?", { exact: true }).click();
    await expect(page.getByPlaceholder("Pertanyaan")).toHaveValue("Apakah bisa nego harga?", { timeout: 10000 });
    await expect(page.locator('[contenteditable="true"]')).toHaveText("Bisa, hubungi kami langsung.", { timeout: 10000 });
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Klik tile "Katalog (bersarang)" -> konfirmasi dulu (audit UX, 14
    // September 2026: sebelumnya langsung redirect tanpa jeda, kreator yang
    // sekadar penasaran/salah klik kehilangan konteks edit katalognya) --
    // baru pindah ke halaman langganan kalau benar-benar klik "Lihat Paket
    // Premium" di popup konfirmasi (gerbang UI).
    await page.getByRole("button", { name: /Katalog \(bersarang\)/ }).click();
    await expect(page.getByText("Fitur Premium")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Lihat Paket Premium" }).click();
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
    // Modal v2: "Katalog" ada di tab "Lanjutan" ("Populer" adalah tab
    // default, tidak berisi "Katalog").
    await page.getByRole("button", { name: "Lanjutan", exact: true }).click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder("Judul blok").fill("Perumahan");
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("Judul item baru (mis. Tipe 36)").fill("Perumahan Tipe A");
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toBeVisible({ timeout: 5000 });

    // Klik tile "Katalog (bersarang)" LANGSUNG pindah ("drill down") ke
    // catalogItems KOSONG milik katalog tertanam ini sendiri (sama persis
    // komponen CatalogItemsFrame yang dipakai katalog tingkat atas) --
    // TIDAK ada lagi field ganti judul blok tertanam terpisah di alur baru
    // ini (beda dari form lama CatalogBlocksEditor), jadi judulnya tetap
    // default "Katalog (bersarang)".
    const catalogTile = page.getByRole("button", { name: /Katalog \(bersarang\)/ });
    await expect(catalogTile.getByText("Premium")).toHaveCount(0);
    await catalogTile.click();

    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 5000 });
    await page.getByPlaceholder("Judul item baru (mis. Tipe 36)").fill("Unit 1");
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toHaveValue("Unit 1", { timeout: 5000 });
    await page.waitForTimeout(1500);

    // Reload -- editor tertutup total, navigasi ulang dari awal: Perumahan
    // -> Perumahan Tipe A -> blok "Katalog (bersarang)" yang sudah ada ->
    // item "Unit 1" di dalamnya.
    await page.reload();
    const perumahanRow = page.locator("li", { hasText: "Perumahan" }).first();
    await perumahanRow.getByRole("button", { name: "Edit Konten", exact: true }).click();
    await page.getByRole("button", { name: /Perumahan Tipe A/ }).click();
    await page.getByText("Katalog (bersarang)", { exact: true }).first().click();
    await page.getByRole("button", { name: /Unit 1/ }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toHaveValue("Unit 1", { timeout: 10000 });

    await page.goto(`/${username}`);
    await page.getByText("Perumahan", { exact: true }).click();
    await page.getByText("Perumahan Tipe A", { exact: true }).click();
    await page.getByText("Katalog (bersarang)", { exact: true }).click();
    await expect(page.getByText("Unit 1", { exact: true })).toBeVisible();

    await page.getByLabel("Kembali").click();
    await expect(page.getByText("Katalog (bersarang)", { exact: true })).toBeVisible();
    await page.getByLabel("Kembali").click();
    await expect(page.getByText("Perumahan Tipe A", { exact: true })).toBeVisible();
  });

  // Judul item katalog jadi OPSIONAL -- susulan 14 September 2026,
  // permintaan langsung pengguna: "saat saya masuk ke katalog itu langsung
  // berisi blok blok yang mau ditambahkan saja gausah mengisi new item
  // title, jadi isi katalog bisa kita sesuaikan dengan blok blok yang kita
  // mau saja". SEBELUMNYA "+ Tambah Item" disabled & backend menolak
  // (links.go: "setiap item katalog wajib punya id dan judul") sampai judul
  // diisi -- padahal pola paling umum sekarang justru langsung tambah blok
  // "produk" (title jadi tidak relevan sama sekali begitu linkedProduct
  // terdeteksi, lihat catalog-produk-live-reference.spec.ts). Item tanpa
  // judul & tanpa produk tertaut jatuh ke fallback "Item tanpa judul" (di
  // editor) / "Item" (di halaman publik) -- dites di sini pakai blok Teks
  // biasa supaya independen dari test live-reference produk.
  test("judul item opsional: buat item tanpa judul, langsung tambah blok Teks", async ({ page }) => {
    const { username } = await registerAndLogin(page, "catnotitle");
    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Lanjutan", exact: true }).click();
    await page.getByRole("button", { name: "Katalog", exact: true }).click();
    await page.getByPlaceholder("Judul blok").fill("Katalog Uji");
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByPlaceholder("Judul item baru (mis. Tipe 36)")).toBeVisible({ timeout: 10000 });

    // JANGAN isi "Judul Item Baru" sama sekali -- langsung klik tombolnya.
    await page.getByRole("button", { name: "+ Tambah Item" }).click();
    await expect(page.getByPlaceholder("Judul item", { exact: true })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Teks", exact: true }).click();
    const textEditor = page.locator('[contenteditable="true"]');
    await textEditor.click();
    await page.keyboard.type("Konten langsung tanpa judul item.");
    await textEditor.blur();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Reload -- pastikan item tanpa judul benar-benar tersimpan di server
    // (bukan cuma lolos validasi klien), fallback "Item tanpa judul" tampil.
    await page.reload();
    await page.locator("li", { hasText: "Katalog Uji" }).first().getByRole("button", { name: "Edit Konten", exact: true }).click();
    await expect(page.getByText("Item tanpa judul")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Kembali", exact: true }).click();

    // Halaman publik: tile grid jatuh ke fallback "Item" (bukan blank).
    await page.goto(`/${username}`);
    await page.getByRole("button", { name: "Katalog Uji" }).click();
    await expect(page.getByRole("button", { name: "Item" })).toBeVisible({ timeout: 10000 });
  });
});
