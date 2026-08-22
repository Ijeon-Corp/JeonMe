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
  test("produk baru muncul di Toko publik SETELAH file diunggah & diaktifkan, lalu bisa dibeli sampai lunas", async ({ page }) => {
    const { username } = await registerAndLogin(page, "shop");
    const productName = "Ebook E2E";
    const priceIDR = 25000;

    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Manage Items" }).click();
    await page.getByRole("button", { name: "Tambah Produk" }).click();
    await page.getByRole("button", { name: "Digital Product" }).click();

    await page.getByPlaceholder("Nama produk").fill(productName);
    await page.getByPlaceholder("Harga (IDR)").fill(String(priceIDR));
    // Sampul WAJIB sejak 19 Agustus 2026 (permintaan langsung pengguna:
    // "sampul jangan dijadikan opsional") -- SATU-SATUNYA input file yang
    // ada di form create ini (unggah File Produk terpisah masih lewat
    // modal Kelola setelah produk ada, lihat di bawah).
    await page
      .locator("form", { has: page.getByPlaceholder("Nama produk") })
      .locator('input[type="file"]')
      .setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await page.locator("form", { has: page.getByPlaceholder("Nama produk") }).getByRole("button", { name: "Buat" }).click();

    const productRow = page.getByRole("row", { name: new RegExp(productName) });
    await expect(productRow).toBeVisible({ timeout: 10000 });

    // Belum ada file & belum aktif -- TIDAK boleh muncul di halaman Toko
    // publik sama sekali (GetPublicPage/list backend filter is_active=true,
    // lihat riset alur checkout sebelum test ini ditulis).
    await page.goto(`/p/${username}`);
    await expect(page.getByText(productName)).toHaveCount(0);

    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Manage Items" }).click();
    await productRow.getByRole("button", { name: "Kelola" }).click();

    // Input file produk (BUKAN input sampul -- sampul punya atribut accept
    // gambar, input file produk tidak, lihat page.tsx sekitar baris 1139-1166).
    await page
      .locator('input[type="file"]:not([accept])')
      .setInputFiles({ name: "ebook.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 konten uji e2e") });
    await expect(page.getByRole("button", { name: "File Produk terunggah" })).toBeVisible({ timeout: 10000 });

    // Sakelar "Aktifkan {nama}" ada di BARIS TABEL (bukan di dalam modal
    // Kelola) -- modal harus ditutup dulu, sebelum ditutup backdrop-nya
    // (fixed inset-0 z-50) menutupi baris tabel di belakangnya dan
    // mencegat klik. getByLabel (bukan getByRole name) -- ada tombol
    // "Tutup" LAIN yang tidak terkait (banner tutorial "Baru di Jeonme?"),
    // tombol tutup modal ini pakai aria-label bukan teks visible.
    await page.getByLabel("Tutup").click();
    const activateToggle = page.getByRole("switch", { name: `Aktifkan ${productName}` });
    await activateToggle.click();
    await expect(activateToggle).toHaveAttribute("aria-checked", "true");

    // Sekarang HARUS tampil di Toko publik lengkap dengan harga & tombol Beli.
    await expect(async () => {
      await page.goto(`/p/${username}`);
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
    await page.goto(`/p/${username}`);

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
    await page.getByPlaceholder("Email kamu").fill(`pembeli-${Date.now()}@example.com`);
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

    // Terjual bertambah di dashboard Manage Items setelah lunas.
    await page.goto("/dashboard/products");
    await page.getByRole("button", { name: "Manage Items" }).click();
    await expect(page.getByRole("row", { name: new RegExp(productName) }).getByRole("cell").nth(2)).toHaveText("1");
  });
});
