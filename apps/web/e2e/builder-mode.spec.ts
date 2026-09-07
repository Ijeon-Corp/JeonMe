import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

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
});
