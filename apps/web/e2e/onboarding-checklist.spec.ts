import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Gap #5 dari laporan benchmark kompetitif (permintaan langsung pengguna, 9
// Agustus 2026): pita onboarding sebelumnya cuma "Baru di Jeonme? Lihat
// Tutorial" statis -- diganti checklist progresif yang dihitung SERVER-SIDE
// dari state akun sungguhan (bukan dummy). Test ini membuktikan progres
// benar-benar berubah mengikuti aksi kreator sungguhan (tambah tautan),
// bukan cuma tampilan statis dengan angka palsu.
//
// Checklist SEKARANG cuma 3 item (bukan 4) -- item "Terbitkan halaman
// publik" dihapus total, permintaan langsung pengguna 20 Agustus 2026:
// "hilangkan terbitkan halaman publik karna langsung otomatis aktif dan
// terbit halaman nya" (halaman utama selalu aktif sejak akun dibuat,
// lihat onboarding.go & migrasi 000074 -- tidak ada lagi langkah publish
// manual untuk dites di sini).
test.describe("Onboarding: Checklist Progresif", () => {
  test("progres checklist naik mengikuti aksi sungguhan (tambah tautan)", async ({ page }) => {
    await registerAndLogin(page, "onbcheck");

    await expect(page.getByText("Lengkapi setup akunmu -- 0/3 selesai")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Lihat semua" }).click();
    await expect(page.getByText("Tambah tautan atau produk pertama")).toBeVisible();

    // Tambah tautan pertama -- pola sama seperti links.spec.ts.
    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();
    await page.getByPlaceholder("Judul tautan").fill("Toko Online Saya");
    await page.getByPlaceholder("https://...").fill("https://example.com/toko");
    await page
      .locator("form", { has: page.getByPlaceholder("Judul tautan") })
      .getByRole("button", { name: "Tambah" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: "Toko Online Saya" })).toBeVisible({ timeout: 10000 });

    await page.reload();
    await expect(page.getByText("Lengkapi setup akunmu -- 1/3 selesai")).toBeVisible({ timeout: 10000 });
    // exact:true -- ditemukan lewat audit 22 Agustus 2026: tanpa ini,
    // locator juga cocok dengan tombol GALERI IKON "Lihat semua pilihan"
    // (title attribute, dashboard/links/page.tsx) yang SAMA-SAMA ada di
    // halaman ini -- strict mode violation (2 elemen cocok), bukan bug
    // fitur, murni selector kurang spesifik.
    await page.getByRole("button", { name: "Lihat semua", exact: true }).click();
    // Item yang sudah selesai dicoret & tidak lagi berupa link actionable.
    // .first() -- halaman /dashboard/links MASIH terbuka (baru direload,
    // bukan navigasi), checklist di banner SELALU dirender lebih dulu di
    // DOM (di atas konten halaman), jadi .first() = banner.
    await expect(page.getByText("Tambah tautan atau produk pertama", { exact: true }).first()).toHaveClass(/line-through/);
  });

  test("checklist ikut ter-refresh lewat navigasi sidebar (client-side, TANPA reload manual)", async ({ page }) => {
    // Bug dilaporkan pengguna (13 Agustus 2026, screenshot): "saya sudah
    // melakukan semua intruksi setup akun tetapi kenapa indikasi sudah
    // dilakukan nya tidak ada" -- checklist tetap 0/N walau semua langkah
    // sungguhan sudah dikerjakan. Akar masalah: OnboardingBanner dipasang
    // di dashboard layout.tsx yang PERSISTEN lintas navigasi client-side
    // (App Router tidak remount layout), sedangkan efek fetch statusnya
    // SEBELUMNYA dependency array kosong ("cuma sekali saat mount") --
    // jadi begitu banner termuat pertama kali, dia BEKU di status itu
    // selamanya walau kreator lanjut menyelesaikan langkah lain di
    // halaman-halaman berikutnya TANPA pernah me-reload browser secara
    // manual, yang mana itulah cara kreator sungguhan memakai dashboard
    // ini (klik-klik sidebar, bukan reload manual tiap kali).
    //
    // Test SEBELUMNYA (di atas) memakai page.goto()/page.reload() di
    // antara tiap aksi -- keduanya navigasi BROWSER PENUH (bukan transisi
    // client-side Next.js <Link>), jadi remount ulang OnboardingBanner
    // dari nol dan TIDAK PERNAH benar-benar menguji bug ini (itu sebabnya
    // lolos sebelum bug ini ditemukan). Test ini SENGAJA memakai
    // page.getByRole("link").click() lewat sidebar (transisi client-side
    // sungguhan) supaya benar-benar membuktikan fix (usePathname sebagai
    // dependency efek fetch, lihat OnboardingBanner.tsx) bekerja, bukan
    // cuma lolos karena reload yang menyembunyikan bug.
    await registerAndLogin(page, "onbcheck2");

    await expect(page.getByText("Lengkapi setup akunmu -- 0/3 selesai")).toBeVisible({ timeout: 10000 });

    // Navigasi ke Link Bio lewat SIDEBAR (klik <Link>, bukan page.goto) --
    // "Link Bio" ada di dalam grup collapsible "Halaman Saya", buka dulu.
    await page.getByRole("button", { name: "Halaman Saya" }).click();
    await page.getByRole("link", { name: "Link Bio", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/links$/);
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();
    await page.getByPlaceholder("Judul tautan").fill("Toko Online Saya");
    await page.getByPlaceholder("https://...").fill("https://example.com/toko");
    await page
      .locator("form", { has: page.getByPlaceholder("Judul tautan") })
      .getByRole("button", { name: "Tambah" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: "Toko Online Saya" })).toBeVisible({ timeout: 10000 });

    // Balik ke Ringkasan lewat SIDEBAR juga -- ini transisi client-side
    // yang SEBELUM fix tidak pernah memicu refetch checklist sama sekali.
    await page.getByRole("link", { name: "Ringkasan", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Lengkapi setup akunmu -- 1/3 selesai")).toBeVisible({ timeout: 10000 });
  });
});
