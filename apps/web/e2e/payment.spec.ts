import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

test.describe("Pengaturan: Pembayaran & Penarikan", () => {
  test("tambah metode pembayaran, verifikasi, jadikan utama, lalu muncul di form penarikan", async ({ page }) => {
    await registerAndLogin(page, "paymethod");

    await page.goto("/dashboard/settings/payment");
    await expect(page.getByRole("heading", { name: "Pembayaran & Penarikan" })).toBeVisible();

    await page.getByRole("button", { name: "+ Tambah Metode Pembayaran" }).click();
    await page.getByPlaceholder("Penyedia (mis. BCA, GoPay)").fill("BCA");
    await page.getByPlaceholder("Nomor rekening/e-wallet").fill("1234567890");
    await page.getByPlaceholder("Nama pemilik rekening").fill("Nama E2E");
    await page
      .locator("form")
      .filter({ has: page.getByPlaceholder("Nama pemilik rekening") })
      .getByRole("button", { name: "Simpan" })
      .click();

    await expect(
      page.getByRole("status").filter({ hasText: "Metode pembayaran ditambahkan" })
    ).toBeVisible();
    await expect(page.getByText("BCA ••••7890")).toBeVisible();
    await expect(page.getByText("Belum verifikasi")).toBeVisible();

    await page.getByRole("button", { name: "Verifikasi" }).click();
    await expect(page.getByRole("status").filter({ hasText: /kode: \d{6}/ })).toBeVisible();

    const toastText = await page.getByRole("status").filter({ hasText: /kode: \d{6}/ }).innerText();
    const code = toastText.match(/\d{6}/)?.[0];
    expect(code).toBeTruthy();

    await page.getByPlaceholder("Kode 6 digit").fill(code!);
    await page.getByRole("button", { name: "Konfirmasi" }).click();
    await expect(page.getByRole("status").filter({ hasText: "terverifikasi" })).toBeVisible();
    await expect(page.getByText("Terverifikasi", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Jadikan Utama" }).click();
    await expect(page.getByRole("status").filter({ hasText: "utama diperbarui" })).toBeVisible();
    await expect(page.getByText("Utama", { exact: true })).toBeVisible();

    // Modul Settings §3 (keputusan pengguna 2026-07-31): penarikan wajib
    // lewat metode terverifikasi -- harus muncul otomatis di form penarikan.
    await page.goto("/dashboard/balance");
    await expect(page.locator("select").filter({ hasText: "BCA" })).toBeVisible();

    // Modul Settings audit fase 6: hasil ajukan penarikan (sukses/gagal)
    // wajib muncul lewat toast, bukan silent save -- akun baru bersaldo 0
    // jadi ini menguji jalur gagal, yang sebelumnya cuma nampil di banner
    // setError diam-diam.
    await page.getByPlaceholder("Jumlah (IDR)").fill("50000");
    await page.getByRole("button", { name: "Ajukan" }).click();
    await expect(page.getByRole("status")).toBeVisible();
  });

  test("auto-withdraw ditolak sebelum ada metode utama terverifikasi, diterima sesudahnya", async ({ page }) => {
    await registerAndLogin(page, "payschedule");

    await page.goto("/dashboard/settings/payment");

    const scheduleSelect = page.locator("select").filter({ has: page.locator('option[value="weekly"]') });
    await scheduleSelect.selectOption("weekly");
    await page.locator('input[placeholder="Saldo minimum (Rp)"]').fill("100000");
    await page.getByRole("button", { name: "Simpan", exact: true }).last().click();
    await expect(
      page.getByRole("status").filter({ hasText: "tambahkan & verifikasi metode pembayaran utama dulu" })
    ).toBeVisible();

    // Tambah + verifikasi + jadikan utama.
    await page.getByRole("button", { name: "+ Tambah Metode Pembayaran" }).click();
    await page.getByPlaceholder("Penyedia (mis. BCA, GoPay)").fill("GoPay");
    await page.getByPlaceholder("Nomor rekening/e-wallet").fill("081234567890");
    await page.getByPlaceholder("Nama pemilik rekening").fill("Nama E2E");
    await page
      .locator("form")
      .filter({ has: page.getByPlaceholder("Nama pemilik rekening") })
      .getByRole("button", { name: "Simpan" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Metode pembayaran ditambahkan" })).toBeVisible();

    await page.getByRole("button", { name: "Verifikasi" }).click();
    const toastText = await page.getByRole("status").filter({ hasText: /kode: \d{6}/ }).innerText();
    const code = toastText.match(/\d{6}/)?.[0];
    await page.getByPlaceholder("Kode 6 digit").fill(code!);
    await page.getByRole("button", { name: "Konfirmasi" }).click();
    await expect(page.getByRole("status").filter({ hasText: "terverifikasi" })).toBeVisible();

    await page.getByRole("button", { name: "Jadikan Utama" }).click();
    await expect(page.getByRole("status").filter({ hasText: "utama diperbarui" })).toBeVisible();

    await scheduleSelect.selectOption("weekly");
    await page.getByRole("button", { name: "Simpan", exact: true }).last().click();
    await expect(page.getByRole("status").filter({ hasText: "Jadwal penarikan disimpan" })).toBeVisible();
  });

  test("split kolaborator per produk tersimpan setelah kolaborator aktif", async ({ page, browser }) => {
    const { username: ownerUsername } = await registerAndLogin(page, "splitowner");

    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    try {
      const { email: collabEmail } = await registerAndLogin(collabPage, "splitcollab");

      // Pemilik mengundang kolaborator (role Admin Penjualan -> akses
      // Produk saja, cukup untuk test ini).
      await page.goto("/dashboard/team");
      await page.getByPlaceholder("email@contoh.com atau username").fill(collabEmail);
      await page.getByLabel("Role kolaborator baru").selectOption("sales_admin");
      await page.getByRole("button", { name: "Kirim Undangan" }).click();
      await expect(page.getByText(collabEmail, { exact: true })).toBeVisible();

      // Kolaborator menerima undangan.
      await collabPage.goto("/dashboard/team");
      await expect(collabPage.getByText(`@${ownerUsername}`)).toBeVisible();
      await collabPage.getByRole("button", { name: "Terima" }).click();
      await expect(collabPage.getByText(`@${ownerUsername}`)).not.toBeVisible();

      // Pemilik membuat produk lalu mengatur split ke kolaborator.
      await page.goto("/dashboard/products");
      await page.getByRole("button", { name: "Tambah Produk" }).click();
      await page.getByPlaceholder("Nama produk").fill("Produk Split E2E");
      await page.getByPlaceholder("Harga (IDR)").fill("100000");
      await page.getByRole("button", { name: "Buat" }).click();
      await expect(page.getByText("Produk Split E2E")).toBeVisible();

      await page.getByTitle("Split Pendapatan Kolaborator").click();
      await page.getByRole("combobox").filter({ hasText: "Pilih kolaborator" }).selectOption({ label: collabEmail });
      await page.locator('input[placeholder="%"]').fill("20");
      await page.getByRole("button", { name: "Simpan" }).click();

      await expect(page.getByText(/1 kolaborator berbagi 20% pendapatan/)).toBeVisible();
    } finally {
      await collabContext.close();
    }
  });
});
