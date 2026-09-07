import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, grantPremium, registerAndLogin } from "./fixtures";

// Halaman Tambahan Fase 2 (permintaan langsung pengguna, 28 Agustus 2026,
// referensi UI kompetitor "+ Page" + navigation pill): /dashboard/pages
// (form terpisah) DIHAPUS TOTAL, digantikan pill navigasi di dalam editor
// Link Bio sendiri ("Home" + satu pill per halaman Bio/Landing tambahan) dan
// pill sejenis di tab "Halaman Toko" (menu Produk & Monetisasi) khusus untuk
// Toko ke-2..5 -- keputusan langsung pengguna lewat AskUserQuestion: "Tetap
// di menu Toko (Produk & Monetisasi)", supaya pembuatan Toko tambahan TIDAK
// campur dengan mekanisme "+ Page" yang baru (yang cuma untuk Bio/Landing).
//
// Gating Premium: Halaman Bio/Landing tambahan 100% eksklusif Premium (0
// jatah gratis), Toko tambahan (ke-2..5) juga eksklusif Premium (jatah
// gratis 1 -- canonical yang otomatis dibuat begitu produk pertama ada).
// Satu akun dipakai per skenario (gratis -> upgrade Premium via DB seed,
// grantPremium di fixtures.ts) supaya hemat bucket rate-limit auth.
test.describe("Halaman Tambahan & Batas Premium", () => {
  test("Link Bio: akun gratis diarahkan ke Langganan Premium, Premium bisa buat & berpindah halaman lewat pill", async ({ page }) => {
    const { username } = await registerAndLogin(page, "pagesbio");

    await page.goto("/dashboard/links");
    await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
    // Label di atas pill nav (susulan permintaan langsung pengguna: "tambah
    // label di atas pill nav") -- hasText STRING cocok SUBSTRING (bentrok
    // dgn "Multi-halaman..." di kartu Upgrade Premium & breadcrumb "Halaman
    // Saya / Link & Block"), jadi regex exact /^Halaman$/ supaya cuma cocok
    // paragraf label pill nav persis.
    await expect(page.locator("p", { hasText: /^Halaman$/ })).toBeVisible();

    // Akun gratis: tombol "+ Page" mengarahkan ke halaman Langganan Premium,
    // BUKAN membuka modal buat halaman (gating 100% server-enforced juga,
    // lihat CreatePage backend -- ini cuma UX preemptive di klien).
    await page.getByRole("button", { name: "Page", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\/subscription/);

    grantPremium(username);
    await page.goto("/dashboard/links");

    // Premium: "+ Page" membuka modal, HANYA minta judul (permintaan
    // langsung pengguna: "isi an hanya title nya saja").
    await page.getByRole("button", { name: "Page", exact: true }).click();
    await expect(page.getByText("Halaman Baru")).toBeVisible();
    await page.getByPlaceholder("Contoh: Promo Agustus").fill("Promo Agustus E2E");
    await page.getByRole("button", { name: "Buat Halaman", exact: true }).click();

    // Berhasil dibuat -> otomatis pindah ke halaman baru itu (pill aktif).
    const newPagePill = page.getByRole("button", { name: /Promo Agustus E2E/ });
    await expect(newPagePill).toBeVisible({ timeout: 10000 });
    await expect(newPagePill).toBeDisabled(); // pill aktif dinonaktifkan dari klik ulang

    // Pratinjau ("Buka") harus mengarah ke {username}/{slug}, BUKAN ke
    // halaman utama -- membuktikan editor benar-benar pindah konteks.
    // exact:true -- tautan "Buka Mode Builder (Kanvas)" (Canvas Page
    // Builder) juga cocok substring "Buka" tanpa ini.
    await expect(page.getByRole("link", { name: "Buka", exact: true })).toHaveAttribute(
      "href",
      new RegExp(`/${username}/promo-agustus-e2e`)
    );

    // Tambahkan satu tautan KHUSUS di halaman tambahan ini (pola sama
    // links.spec.ts: modal "Tambah" -> tile "Tautan" -> isi Judul/URL).
    const linkTitle = "Tautan Khusus Promo";
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();
    await page.getByLabel("Judul").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill("https://example.com/promo");
    const addForm = page.locator("form", { has: page.getByLabel("Judul") });
    await addForm.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Pindah balik ke Home -- tautan tadi TIDAK ikut muncul (bukti isolasi
    // per-halaman, klaim inti fitur ini: "pratinjau blok dll mengikuti isi
    // dari tiap page").
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page.getByRole("link", { name: "Buka", exact: true })).toHaveAttribute("href", new RegExp(`/${username}$`));
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toHaveCount(0);

    // Pindah lagi ke halaman tambahan -- tautannya masih ada (bukan hilang,
    // cuma tidak ditampilkan waktu Home aktif).
    await newPagePill.click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Modul duplikat halaman (permintaan langsung pengguna: "buat bisa
    // duplikat isi dari page lainnya") -- halaman baru mewarisi SELURUH
    // isi "Promo Agustus E2E" (termasuk tautannya), tanpa perlu diisi ulang
    // manual.
    await page.getByRole("button", { name: "Page", exact: true }).click();
    await page.getByPlaceholder("Contoh: Promo Agustus").fill("Duplikat Promo E2E");
    await page.getByLabel("Mulai dari").selectOption({ label: 'Duplikat dari "Promo Agustus E2E"' });
    await page.getByRole("button", { name: "Buat Halaman", exact: true }).click();

    const duplicatedPagePill = page.getByRole("button", { name: /Duplikat Promo E2E/ });
    await expect(duplicatedPagePill).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Toggle "Tampilkan foto, nama, bio & ikon sosial" (permintaan langsung
    // pengguna: "saya mau fungsinya tidak menampikan foto nama desc dan
    // juga ikon sosial ketika tidak diaktifkan") -- default ON, mematikannya
    // menyembunyikan SELURUH renderBioHeader (avatar/nama/bio/ikon sosial
    // sekaligus, semuanya dirender di dalam satu fungsi yang sama) di
    // halaman publik. Locator DIBATASI ke <label> yang membungkus toggle
    // ini -- getByRole("switch") polos juga akan cocok dengan toggle
    // is_active tiap kartu tautan di daftar bawah.
    await page.locator("label", { hasText: "Tampilkan foto, nama, bio & ikon sosial" }).getByRole("switch").click();

    // Terbitkan kedua halaman tambahan supaya muncul di site_pages/hamburger
    // halaman publik.
    async function publishActivePage() {
      const toggle = page.locator("label", { hasText: "Terbitkan" }).getByRole("switch");
      if ((await toggle.getAttribute("aria-checked")) !== "true") {
        await toggle.click();
      }
    }
    await publishActivePage();
    await newPagePill.click();
    // Tunggu pindah halaman BENAR-BENAR selesai sebelum publishActivePage
    // baca toggle "Terbitkan" -- toBeDisabled() saja TIDAK cukup (pill jadi
    // disabled SEKETIKA saat diklik, sebelum switchToPage async selesai
    // fetch data halaman baru) -- race nyata ditemukan 8 September 2026:
    // publishActivePage baca aria-checked BASI milik "Duplikat Promo E2E"
    // (baru saja dimatikan togglenya) sebelum data "Promo Agustus E2E" yang
    // asli (toggle "Tampilkan foto..." TIDAK PERNAH disentuh, harus tetap
    // "true") selesai dimuat -- akibatnya publish "Promo Agustus E2E"
    // dilewati (dikira sudah published). Tunggu toggle itu balik "true"
    // dulu sbg bukti data halaman baru benar-benar sudah termuat.
    await expect(newPagePill).toBeDisabled();
    await expect(page.locator("label", { hasText: "Tampilkan foto, nama, bio & ikon sosial" }).getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 10000 }
    );
    await publishActivePage();

    // Halaman publik: dengan Home + 2 halaman tambahan terbit (3 total),
    // hamburger PageSwitcher HARUS muncul -- permintaan langsung pengguna:
    // "aktifkan menu hamburger jika ada page lebih dari satu".
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByLabel("Ganti halaman")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });
    await page.getByLabel("Ganti halaman").click();
    await expect(page.getByRole("link", { name: /Link Bio/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Promo Agustus E2E/ })).toBeVisible();

    // Kontras: "Promo Agustus E2E" TIDAK pernah menyentuh toggle ini
    // (default ON) -- headernya (nama tampilan, jatuh balik ke username)
    // HARUS tetap tampil, membuktikan toggle sungguhan mengubah sesuatu
    // (bukan cuma selalu tersembunyi/selalu tampil apa pun nilainya).
    await page.goto(`/${username}/promo-agustus-e2e`);
    await expect(page.getByRole("heading", { name: username })).toBeVisible({ timeout: 10000 });

    // Halaman "Duplikat Promo E2E" -- header profil disembunyikan (toggle
    // dimatikan di atas): nama tampilan TIDAK dirender sebagai heading, dan
    // tautan/blok biasa TETAP tampil seperti biasa (cuma header yang hilang).
    await page.goto(`/${username}/duplikat-promo-e2e`);
    await expect(page.getByText(linkTitle)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: username })).toHaveCount(0);
  });

  test("Toko: switcher multi-Toko tersembunyi untuk akun gratis, muncul & bisa buat Toko baru setelah Premium", async ({ page }) => {
    const { username } = await registerAndLogin(page, "pagestoko");

    await page.goto("/dashboard/products");
    // Tab "Manage Items" diganti "Produk" di shell v2 (dashboard-flags.ts
    // area "sales", spec §"Primary: Ringkasan · Produk · Pesanan · Halaman
    // Toko") -- exact:true supaya tidak bentrok dgn tombol "Tambah Produk".
    await page.getByRole("button", { name: "Produk", exact: true }).click();

    // Produk "Link Eksternal" -- jenis paling ringan (tidak butuh unggah
    // file), cukup untuk memicu ensureProdukPage (Toko canonical otomatis).
    // .first() -- ada 2 tombol "Tambah Produk" berbarengan (CTA header +
    // CTA empty-state, keduanya buka alur yang sama).
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

    await page.getByRole("button", { name: "Halaman Toko" }).click();

    // Akun gratis, 1 Toko (canonical) -- switcher multi-Toko SENGAJA
    // disembunyikan (tidak relevan untuk kreator gratis yang cuma boleh
    // 1 Toko), beda dari sebelumnya (dashboard/pages) yang selalu tampil.
    await expect(page.getByRole("button", { name: "Toko", exact: true })).toHaveCount(0);

    grantPremium(username);
    await page.reload();
    await page.getByRole("button", { name: "Halaman Toko" }).click();

    // Premium -- switcher muncul: pill Toko canonical + tombol "+ Toko".
    await expect(page.getByRole("button", { name: "Toko", exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: new RegExp(`^Toko ${username}`) })).toBeVisible();

    await page.getByRole("button", { name: "Toko", exact: true }).click();
    await expect(page.getByText("Toko Baru")).toBeVisible();
    await page.getByPlaceholder("Contoh: Toko Skincare").fill("Toko Kedua E2E");
    await page.getByRole("button", { name: "Buat Toko", exact: true }).click();

    const secondStorePill = page.getByRole("button", { name: /Toko Kedua E2E/ });
    await expect(secondStorePill).toBeVisible({ timeout: 10000 });
    await expect(secondStorePill).toBeDisabled();

    // Pratinjau harus ikut pindah ke Toko kedua (slug bebas, bukan
    // username), membuktikan ProdukPageEditor benar-benar menampilkan
    // konteks Toko yang sedang aktif, bukan selalu canonical.
    await expect(page.getByRole("link", { name: "Buka", exact: true })).toHaveAttribute("href", new RegExp(`/${username}/toko-kedua-e2e`));

    // Pindah balik ke Toko canonical.
    await page.getByRole("button", { name: new RegExp(`^Toko ${username}`) }).click();
    await expect(page.getByRole("link", { name: "Buka", exact: true })).toHaveAttribute("href", new RegExp(`/${username}/${username}$`));
  });
});
