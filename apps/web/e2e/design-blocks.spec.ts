import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Blok desain halaman utama (/dashboard/design/header|tombol|font|sticker)
// -- belum ada cakupan E2E sebelumnya di luar theme.spec.ts (yang cuma
// menguji pemilihan preset tema, bukan kustomisasi manual per blok). Satu
// akun dipakai untuk seluruh langkah supaya tidak menambah beban ke bucket
// rate-limit auth (register+login berbagi SATU bucket 10 req/menit, lihat
// catatan panjang di fixtures.ts) -- suite ini sudah punya banyak spec file
// yang masing-masing perlu register sendiri.
test.describe("Desain: Header, Tombol, Font, Stiker", () => {
  test("kustomisasi header/tombol/font tersimpan & tampil di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "design");

    // Header: nama tampilan + bio.
    await page.goto("/dashboard/design/header");
    await expect(page.getByRole("heading", { name: "Header" })).toBeVisible();
    const displayName = "Kreator E2E Desain";
    const bio = "Bio uji coba E2E untuk blok Header.";
    // Label di halaman ini SIBLING dari input, bukan <label htmlFor>/wrapper
    // -- getByLabel tidak bisa dipakai (tidak ada asosiasi programatik).
    // placeholder Nama Tampilan = username akun sendiri (dinamis per test).
    const displayNameInput = page.getByPlaceholder(username);
    await displayNameInput.fill(displayName);
    await displayNameInput.blur();
    const bioInput = page.locator("textarea");
    await bioInput.fill(bio);
    await bioInput.blur();
    await page.waitForTimeout(500);

    // Tombol: warna tombol kustom -- handleStyleOverride terpasang di onBlur
    // (bukan onChange), fill() Playwright tidak memicu blur secara native
    // jadi harus dipicu manual (pola sama dengan theme.spec.ts No.130).
    await page.goto("/dashboard/design/tombol");
    await expect(page.getByRole("heading", { name: "Tombol" })).toBeVisible();
    const buttonColor = "#13a37d";
    const buttonColorInput = page.locator('input[type="color"]').first();
    await buttonColorInput.fill(buttonColor);
    await buttonColorInput.blur();
    await page.waitForTimeout(500);

    // Font: pilih font non-default dari dropdown (onChange langsung
    // menyimpan, tidak butuh blur).
    await page.goto("/dashboard/design/font");
    await expect(page.getByRole("heading", { name: "Font" })).toBeVisible();
    // Sama seperti di atas -- label bukan htmlFor, dan ini satu-satunya
    // <select> di halaman ini (toggle "Font Judul Terpisah" default mati).
    await page.locator("select").selectOption("playfair");
    await page.waitForTimeout(500);

    // Halaman publik UTAMA (/username, BUKAN /p/username) masih pakai cache
    // fetch ISR Next.js (next: { revalidate: 60 }) di luar cache Redis 30
        // detik API -- tunggu sampai keduanya lewat, sama seperti theme.spec.ts.
    await expect(async () => {
      await page.goto(`/${username}`);
      const html = await page.content();
      expect(html).toContain(displayName);
      expect(html).toContain(bio);
      expect(html.toLowerCase()).toContain(buttonColor);
      expect(html).toContain("font-custom-playfair");
    }).toPass({ timeout: 75000, intervals: [5000] });

    // Stiker: tambah satu stiker dari palet ("Panah Lengkung", shape
    // pertama) -- tersimpan otomatis (handleStickersChange, tidak ada
    // tombol Simpan terpisah), lalu verifikasi 3 lapis: (1) daftar "Stiker
    // Terpasang" di dashboard segera bertambah, (2) tetap ada setelah
    // reload penuh (bukti tersimpan di server, bukan cuma state lokal), (3)
    // SVG stiker itu sendiri (path arrow-curve, StickerIcon.tsx) benar-
    // benar dirender di halaman publik.
    await page.goto("/dashboard/design/sticker");
    await expect(page.getByRole("heading", { name: "Stiker" })).toBeVisible();
    await page.getByTitle("Tambah Panah Lengkung").click();
    await expect(page.getByText("Stiker Terpasang (1)")).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText("Stiker Terpasang (1)")).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.locator('svg path[d="M22 20c-4 24 4 46 26 54"]')).toHaveCount(1, { timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
