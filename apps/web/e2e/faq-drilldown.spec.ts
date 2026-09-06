import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// faq-drilldown.spec.ts -- cakupan e2e BARU (6 September 2026, redesain
// editor blok Katalog/FAQ jadi drill-down gaya Linktree, permintaan
// langsung pengguna: "saya mau jika ada blok di dalam blok buat workflow
// nya sama seperti di linktree"). FAQ TINGKAT ATAS sebelumnya tidak punya
// cakupan e2e sama sekali -- cuma cakupan tidak langsung lewat
// catalog-nested-blocks.spec.ts untuk FAQ TERTANAM di dalam katalog.
//
// Model simpan FAQ tingkat atas SENGAJA beda dari Katalog: tombol Simpan
// eksplisit per pertanyaan, BUKAN autosave onBlur -- dipaksa backend
// (validateBlockDataAtDepth di links.go mewajibkan question+answer lengkap
// persis di depth==1). Spec ini menguji jalur itu: validasi lokal menolak
// simpan tidak lengkap, batas minimal 1 pertanyaan saat hapus, dan
// persistensi lewat reload + halaman publik.
test("FAQ tingkat atas: daftar -> detail -> Simpan, validasi, batas minimal 1 pertanyaan", async ({ page }) => {
  const { username } = await registerAndLogin(page, "faqdrill");
  await page.goto("/dashboard/links");

  await page.getByRole("button", { name: "Tambah" }).first().click();
  await page.getByRole("button", { name: "FAQ", exact: true }).click();
  await page.getByPlaceholder("Judul blok").fill("Pertanyaan Umum");
  await page.getByPlaceholder("Pertanyaan").fill("Apakah ada garansi?");
  await page.getByPlaceholder("Jawaban").fill("Ya, garansi 1 tahun.");
  await page.getByRole("button", { name: "Buat Blok" }).click();
  await expect(page.getByRole("button", { name: "Edit Konten" })).toBeVisible({ timeout: 10000 });

  // Klik "Edit Konten" -> BlockDrilldownEditor (BUKAN panel inline lama)
  await page.getByRole("button", { name: "Edit Konten" }).click();
  const backButton = page.getByRole("button", { name: "Kembali" });
  await expect(backButton).toBeVisible({ timeout: 5000 });

  // Masuk ke pertanyaan yang sudah ada
  await page.getByText("Apakah ada garansi?", { exact: true }).first().click();

  // Validasi lokal: kosongkan jawaban, Simpan harus DITOLAK (tetap di
  // frame + pesan galat), TIDAK boleh sampai PATCH ke server.
  const answerField = page.locator("textarea").first();
  await answerField.fill("");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(backButton).toBeVisible();
  await expect(page.getByText("Isi pertanyaan DAN jawaban sebelum menyimpan.")).toBeVisible();

  // Isi ulang dengan benar -> Simpan -> kembali ke daftar dengan jawaban baru
  await answerField.fill("Ya, garansi resmi 1 tahun penuh.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Apakah ada garansi?", { exact: true }).first()).toBeVisible({ timeout: 10000 });

  // Tambah pertanyaan kedua
  await page.getByRole("button", { name: "+ Tambah Pertanyaan" }).click();
  await page.getByPlaceholder("Pertanyaan").fill("Bagaimana cara retur?");
  await page.getByPlaceholder("Jawaban").fill("Hubungi CS dalam 7 hari.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByText("Bagaimana cara retur?", { exact: true }).first()).toBeVisible({ timeout: 10000 });

  // Hapus pertanyaan pertama (masih tersisa 1 lagi -> diperbolehkan)
  await page.getByText("Apakah ada garansi?", { exact: true }).first().click();
  await page.getByRole("button", { name: "Hapus pertanyaan" }).click();
  await page.getByRole("button", { name: "Ya, Hapus" }).click();
  await expect(page.getByText("Bagaimana cara retur?", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Apakah ada garansi?", { exact: true })).toHaveCount(0);

  // Batas minimal 1 pertanyaan -- tombol hapus di satu-satunya pertanyaan
  // tersisa harus disabled.
  await page.getByText("Bagaimana cara retur?", { exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Hapus pertanyaan" })).toBeDisabled();
  await backButton.click();
  await backButton.click();

  // Reload -- pastikan tersimpan sungguhan di server, bukan cuma state lokal
  await page.reload();
  await page.getByRole("button", { name: "Edit Konten" }).click();
  await expect(page.getByText("Bagaimana cara retur?", { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Apakah ada garansi?", { exact: true })).toHaveCount(0);

  // Halaman publik -- klik pertanyaan untuk buka jawabannya
  await page.goto(`/${username}`);
  await page.getByText("Bagaimana cara retur?", { exact: true }).click();
  await expect(page.getByText("Hubungi CS dalam 7 hari.")).toBeVisible();
});
