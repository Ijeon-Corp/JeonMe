import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, payOrderViaWebhook, registerAndLogin } from "./fixtures";

// Modul Toko (checkout produk digital) -- fitur monetisasi INTI Jeonme
// (lihat CLAUDE.md: "dengan Toko/checkout produk digital bawaan"), belum
// ada cakupan E2E sebelumnya. Alur "Beli" sungguhan berakhir di halaman
// Snap ter-hosting Midtrans (redirect penuh ke luar localhost) yang tidak
// bisa diselesaikan murni lewat browser di sandbox ini -- lihat komentar
// payOrderViaWebhook di fixtures.ts untuk kenapa pelunasan disimulasikan
// lewat webhook bertanda tangan valid alih-alih klik lewat halaman Midtrans
// sungguhan.
test.describe("Toko & Checkout", () => {
  test("produk baru muncul di Toko publik SETELAH file diunggah & diaktifkan, lalu bisa dibeli sampai lunas", async ({ page, request }) => {
    const { username } = await registerAndLogin(page, "shop");
    const productName = "Ebook E2E";
    const priceIDR = 25000;

    await page.goto("/dashboard/products");
    // Tab "Manage Items" diganti nama jadi "Produk" (i18n EN/ID dashboard,
    // lihat dashboard.nav.salesProducts di lib/i18n/dictionaries.ts) sebagai
    // bagian redesain dashboard Fase 2/5 (commit 378324f/22ed78c).
    await page.getByRole("button", { name: "Produk" }).click();
    // .first() -- saat daftar produk masih kosong, tombol "+ Tambah Produk"
    // di header tab DAN CTA di dalam EmptyState (redesain empty state 1 Sept
    // 2026, commit 0f5cdf5) sama-sama tampil dengan label identik; keduanya
    // cuma memanggil setAddingProduct(true), jadi aman diambil yang pertama.
    await page.getByRole("button", { name: "Tambah Produk" }).first().click();
    await page.getByRole("button", { name: "Digital Product" }).click();

    await page.getByPlaceholder("Nama produk").fill(productName);
    await page.getByPlaceholder("Harga (IDR)").fill(String(priceIDR));
    // Kategori WAJIB sejak 15 September 2026 (permintaan langsung
    // pengguna: "category jangan optional") -- dropdown preset SELALU
    // tampil, bahkan utk akun baru tanpa produk sama sekali (lihat
    // CategoryField, CreateProductForm.tsx).
    await page
      .locator("form", { has: page.getByPlaceholder("Nama produk") })
      .locator("select")
      .selectOption({ label: "E-book" });
    // Sampul WAJIB sejak 19 Agustus 2026 (permintaan langsung pengguna:
    // "sampul jangan dijadikan opsional"). File produk JUGA wajib di form
    // ini sejak 18 September 2026 (commit 48c15f4, "product file tampilkan
    // langsung saja ... supaya user tidak lupa") -- jadi ada DUA input file,
    // urutan DOM: file produk dulu (nth 0), lalu sampul (nth 1).
    const createForm = page.locator("form", { has: page.getByPlaceholder("Nama produk") });
    await createForm
      .locator('input[type="file"]')
      .nth(0)
      .setInputFiles({ name: "ebook.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 konten uji e2e") });
    await createForm
      .locator('input[type="file"]')
      .nth(1)
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await page.locator("form", { has: page.getByPlaceholder("Nama produk") }).getByRole("button", { name: "Buat" }).click();

    const productRow = page.getByRole("row", { name: new RegExp(productName) });
    await expect(productRow).toBeVisible({ timeout: 10000 });

    // Produk sudah AKTIF begitu dibuat (file + sampul diunggah dari form,
    // 18 September 2026), tapi TETAP tidak boleh muncul di Toko publik
    // sebelum blok "produk" ditambahkan eksplisit ke Halaman Toko (grid
    // otomatis dihapus 15 September 2026, lihat catatan di bawah).
    // URL Toko pertama akun baru = `/{username}/produk` (slug KONSTAN
    // "produk", BUKAN lagi username diulang) -- diubah lewat commit
    // 2c32957c, 9 Sept 2026 ("URL Toko tidak lagi dobel username"), lihat
    // autoProdukPageSlug di page.go.
    await page.goto(`/${username}/produk`);
    await expect(page.getByText(productName)).toHaveCount(0);

    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Produk" }).click();
    await productRow.getByRole("button", { name: "Kelola" }).click();

    // File produk sudah terunggah dari form create (tidak ada lagi langkah
    // unggah terpisah di modal Kelola) -- modal cuma membuktikan statusnya.
    await expect(page.getByRole("button", { name: "File Produk terunggah" })).toBeVisible({ timeout: 10000 });

    // Sakelar manual "Aktifkan {nama}" DIHAPUS -- permintaan langsung
    // pengguna, 13 September 2026 ("hilangkan status on atau off untuk
    // menampilkan di pratinjau nya"): menu Produk sekarang murni tempat
    // menyimpan data, is_active produk digital jadi OTOMATIS begitu file
    // diunggah (backend product.go UploadFile: `is_active = (is_active OR
    // cover_image_url != '')`, sampul sudah wajib sejak create) -- pola
    // sama seperti payment_link/external_link yang sudah lama auto-aktif.
    // Tidak ada lagi toggle utk diklik di sini, cukup tutup modal.
    // getByLabel (bukan getByRole name) -- ada tombol "Tutup" LAIN yang
    // tidak terkait (banner tutorial "Baru di Jeonme?"), tombol tutup
    // modal ini pakai aria-label bukan teks visible.
    await page.getByLabel("Tutup").click();

    // Blok "produk" WAJIB ditambahkan eksplisit ke Halaman Toko sejak 15
    // September 2026 (permintaan langsung pengguna: "saya mau semua
    // product yang sudah ditambahkan di menu product itu jangan langsung
    // ditampilkan tapi itu data product yang bisa kita tampilkan ketika
    // menambahkan blok produk") -- grid otomatis DIHAPUS TOTAL (test ini
    // luput diperbarui saat itu, ditemukan lewat kegagalan nyata: produk
    // is_active=true & file_key terisi tapi tidak pernah tampil di Toko
    // publik). ProdukPageEditor.tsx (editor klasik Toko) tidak punya tile
    // "Produk" di UI-nya sendiri (lihat catatan lengkap di
    // toko-catalog-block-click.spec.ts) -- dipaksa lewat API langsung,
    // pola sama seperti test itu.
    const token = await page.evaluate(() => localStorage.getItem("jeonme_token"));
    const productsRes = await request.get("http://localhost:8080/api/v1/dashboard/products", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const products: { id: string; name: string }[] = await productsRes.json();
    const product = products.find((p) => p.name === productName);
    expect(product).toBeTruthy();

    const pagesRes = await request.get("http://localhost:8080/api/v1/dashboard/pages", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pages: { id: string; page_type: string }[] = await pagesRes.json();
    const tokoPage = pages.find((p) => p.page_type === "produk");
    expect(tokoPage).toBeTruthy();

    const blockRes = await request.post(`http://localhost:8080/api/v1/dashboard/pages/${tokoPage!.id}/blocks`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { block_type: "produk", title: productName, block_data: { product_ids: [product!.id] } },
    });
    expect(blockRes.status()).toBe(201);

    // Sekarang HARUS tampil di Toko publik lengkap dengan harga & tombol Beli.
    await expect(async () => {
      await page.goto(`/${username}/produk`);
      await expect(page.getByText(productName)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [3000] });
    await expect(page.getByText(`Rp ${priceIDR.toLocaleString("id-ID")}`)).toBeVisible();

    // TIDAK boleh tampil di halaman Bio -- permintaan langsung pengguna, 19
    // Agustus 2026: "jangan tampilkan product di page link bio itu khusus
    // dihalaman toko saja". Grid Produk dihapus total dari render halaman
    // Bio (lihat PagePreview.tsx), walau produknya sendiri aktif & sudah
    // terbukti tampil benar di Toko barusan.
    await page.goto(`/${username}`);
    await expect(page.getByText(productName)).toHaveCount(0);

    // Balik ke halaman Toko -- bug ditemukan lewat audit 22 Agustus 2026:
    // pengecekan Bio di atas (ditambah commit 5ccbe39, 19 Agustus 2026)
    // meninggalkan halaman di `/${username}` (Bio) TANPA navigasi balik ke
    // Toko sebelum mengklik "Beli" di bawah -- tombolnya memang tidak
    // pernah ada di Bio (baru saja dibuktikan barisnya sendiri), jadi klik
    // itu selalu timeout menunggu elemen yang tidak akan pernah muncul.
    await page.goto(`/${username}/produk`);

    // Alur beli: buka form, isi email pembeli, submit -- ini SUNGGUHAN
    // memanggil Midtrans (server-to-server dari API Go) untuk membuat
    // transaksi Snap, jadi invoice_url yang didapat itu nyata. BuyProductButton
    // langsung melakukan `window.location.href = invoice_url` begitu respons
    // diterima -- kalau ditunggu lewat waitForResponse polos, navigasi itu
    // sudah mulai (menghancurkan konteks respons XHR asli) SEBELUM
    // response.json() sempat dipanggil ("Protocol error: No resource with
    // given identifier found", ditemukan lewat percobaan pertama test ini).
    // Fix: intercept requestnya sendiri lewat page.route -- biarkan benar-
    // benar sampai ke API asli (route.fetch()), baca body di sana, LALU
    // fulfill balik ke halaman dengan invoice_url yang sudah diganti ke
    // rute in-app yang aman supaya browser tidak pernah benar-benar pindah
    // ke luar localhost.
    let capturedCheckout: { order_id: string; invoice_url: string } | undefined;
    await page.route("**/api/v1/checkout", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      capturedCheckout = await response.json();
      await route.fulfill({ response, json: { ...capturedCheckout, invoice_url: "/dashboard" } });
    });

    await page.getByRole("button", { name: "Beli", exact: true }).click();
    // Nama/Catatan -- permintaan langsung pengguna, 15 September 2026: "di
    // form pembelian tambahkan beberapa field lagi yang penting selain 2
    // field yang sekarang" -- Nama SEKARANG wajib (backend menolak 400
    // tanpanya, lihat createCheckoutRequest.BuyerName, checkout.go).
    const buyerName = "Pembeli E2E";
    await page.getByPlaceholder("Nama kamu").fill(buyerName);
    await page.getByPlaceholder("Email kamu").fill(`pembeli-${Date.now()}@example.com`);
    await page.getByPlaceholder("Catatan untuk penjual (opsional)").fill("Tolong kirim link cadangan juga.");
    await page.getByRole("button", { name: "Bayar Sekarang" }).click();

    // capturedCheckout memegang body ASLI dari API (sebelum ditulis ulang
    // untuk halaman) -- invoice_url Midtrans Snap sungguhan membuktikan
    // panggilan server-to-server API Go -> Midtrans benar-benar berhasil.
    await expect.poll(() => capturedCheckout, { timeout: 15000 }).toBeTruthy();
    expect(capturedCheckout!.invoice_url).toContain("midtrans.com");
    expect(typeof capturedCheckout!.order_id).toBe("string");
    const orderID = capturedCheckout!.order_id;
    // Halaman sendiri seharusnya mengikuti invoice_url yang SUDAH ditulis
    // ulang (fulfill di atas) -- membuktikan navigasi tidak pernah benar-
    // benar keluar dari localhost.
    await page.waitForURL("**/dashboard", { timeout: 10000 });

    // Lunasi lewat webhook Midtrans sintetis bertanda tangan valid (lihat
    // fixtures.ts) -- setara dengan pembeli menyelesaikan pembayaran QRIS/VA
    // sungguhan di halaman Snap yang tadi digantikan di atas.
    await payOrderViaWebhook(orderID, priceIDR);

    await page.unroute("**/api/v1/checkout");
    await page.goto(`/checkout/${orderID}`);
    await expect(page.getByText("Pembayaran Berhasil")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(productName)).toBeVisible();

    // Terjual bertambah di dashboard Manage Items (tab "Produk") setelah lunas.
    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Produk" }).click();
    await expect(page.getByRole("row", { name: new RegExp(productName) }).getByRole("cell").nth(2)).toHaveText("1");

    // Nama & catatan pembeli (migrasi 000102) HARUS tampil di tab Pesanan --
    // dikumpulkan tanpa gunanya kalau kreator tidak pernah melihatnya lagi.
    await page.getByRole("button", { name: "Pesanan" }).click();
    await expect(page.getByText(buyerName)).toBeVisible({ timeout: 10000 });
    await page.getByText(buyerName).click();
    await expect(page.getByText("Tolong kirim link cadangan juga.")).toBeVisible({ timeout: 5000 });
  });
});
