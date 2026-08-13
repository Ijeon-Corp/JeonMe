import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Gap #5 dari laporan benchmark kompetitif (permintaan langsung pengguna, 9
// Agustus 2026): pita onboarding sebelumnya cuma "Baru di Jeonme? Lihat
// Tutorial" statis -- diganti checklist progresif yang dihitung SERVER-SIDE
// dari state akun sungguhan (bukan dummy). Test ini membuktikan progres
// benar-benar berubah mengikuti aksi kreator sungguhan (terbitkan halaman,
// tambah tautan), bukan cuma tampilan statis dengan angka palsu.
test.describe("Onboarding: Checklist Progresif", () => {
  test("progres checklist naik mengikuti aksi sungguhan (terbitkan halaman, tambah tautan)", async ({ page }) => {
    await registerAndLogin(page, "onbcheck");

    await expect(page.getByText("Lengkapi setup akunmu -- 0/4 selesai")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Lihat semua" }).click();
    await expect(page.getByText("Terbitkan halaman publik")).toBeVisible();
    await expect(page.getByText("Tambah tautan atau produk pertama")).toBeVisible();

    // Terbitkan halaman -- lewat toggle sungguhan di /dashboard/design,
    // BUKAN publishPage() fixture (test ini SPESIFIK memverifikasi
    // checklist bereaksi ke aksi ini, jadi ditempuh langsung lewat UI).
    await page.goto("/dashboard/design");
    const publishToggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
    await publishToggle.click();
    await expect(publishToggle).toHaveAttribute("aria-checked", "true");

    await page.reload();
    await expect(page.getByText("Lengkapi setup akunmu -- 1/4 selesai")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Lihat semua" }).click();
    // Item yang sudah selesai dicoret & tidak lagi berupa link actionable.
    // .first() -- halaman /dashboard/design MASIH terbuka (baru direload,
    // bukan navigasi), yang juga punya teks sama persis (label toggle
    // "Terbitkan halaman publik") -- checklist di banner SELALU dirender
    // lebih dulu di DOM (di atas konten halaman), jadi .first() = banner.
    await expect(page.getByText("Terbitkan halaman publik", { exact: true }).first()).toHaveClass(/line-through/);

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
    await expect(page.getByText("Lengkapi setup akunmu -- 2/4 selesai")).toBeVisible({ timeout: 10000 });
  });

  test("checklist ikut ter-refresh lewat navigasi sidebar (client-side, TANPA reload manual)", async ({ page }) => {
    // Bug dilaporkan pengguna (13 Agustus 2026, screenshot): "saya sudah
    // melakukan semua intruksi setup akun tetapi kenapa indikasi sudah
    // dilakukan nya tidak ada" -- checklist tetap 0/4 walau semua langkah
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

    await expect(page.getByText("Lengkapi setup akunmu -- 0/4 selesai")).toBeVisible({ timeout: 10000 });

    // Navigasi ke Desain lewat SIDEBAR (klik <Link>, bukan page.goto) --
    // "Desain" ada di dalam grup collapsible "Halaman Saya", buka dulu.
    await page.getByRole("button", { name: "Halaman Saya" }).click();
    await page.getByRole("link", { name: "Desain", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/design$/);
    const publishToggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
    await publishToggle.click();
    await expect(publishToggle).toHaveAttribute("aria-checked", "true");

    // Balik ke Ringkasan lewat SIDEBAR juga -- ini transisi client-side
    // yang SEBELUM fix tidak pernah memicu refetch checklist sama sekali.
    await page.getByRole("link", { name: "Ringkasan", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText("Lengkapi setup akunmu -- 1/4 selesai")).toBeVisible({ timeout: 10000 });
  });
});
