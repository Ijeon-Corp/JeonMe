import { test, expect } from "@playwright/test";
import { promoteToAdmin, registerAndLogin, resetLocalAuthRateLimit } from "./fixtures";

// Panel admin (/admin/*) -- belum ada cakupan E2E sebelumnya. Promosi ke
// role admin TIDAK punya alur UI sama sekali (akun admin pertama selalu
// dibuat manual di database sungguhan, lihat promoteToAdmin di fixtures.ts)
// jadi test ini mem-bootstrap lewat SQL langsung, persis seperti operator
// sungguhan melakukannya, lalu SISANYA murni lewat UI admin sungguhan.
test.describe("Panel Admin", () => {
  test("admin bisa menangguhkan & mengaktifkan kembali pengguna, langsung berlaku di login", async ({ browser }) => {
    const targetContext = await browser.newContext();
    const targetPage = await targetContext.newPage();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      const { username: targetUsername, email: targetEmail } = await registerAndLogin(targetPage, "admintarget");
      // Tombol Keluar SEBELUMNYA pindah dari sidebar ke halaman Profil &
      // Akun (30 Agustus 2026), tapi redesain susulan (3 September 2026,
      // lihat komentar di app/dashboard/settings/profile/page.tsx) menghapus
      // tombol inline itu lagi -- logout sekarang HANYA lewat dropdown akun
      // di avatar topbar (app/dashboard/layout.tsx, title="Profil & Akun").
      await targetPage.goto("/dashboard/settings/profile");
      await targetPage.getByTitle("Profil & Akun").click();
      await targetPage.getByRole("menuitem", { name: "Keluar" }).click();
      await targetPage.waitForURL("**/login", { timeout: 10000 });

      const { username: adminUsername } = await registerAndLogin(adminPage, "adminacct");
      promoteToAdmin(adminUsername);

      // Login berikutnya untuk akun admin diarahkan ke /admin, bukan
      // /dashboard (probe getAdminSummary() di login/page.tsx) -- tapi sesi
      // yang SUDAH berjalan ini cukup dinavigasikan langsung, AdminGuard
      // sendiri yang mengecek role dari DB tiap request (bukan klaim JWT
      // lama), jadi tidak perlu logout+login ulang.
      await adminPage.goto("/admin/users");
      await expect(adminPage.getByRole("heading", { name: "Pengguna" })).toBeVisible({ timeout: 10000 });

      await adminPage.getByPlaceholder("Cari email/username...").fill(targetUsername);
      await adminPage.getByRole("button", { name: "Cari" }).click();
      // Kartu baris pengguna (bukan wrapper luar mana pun) -- kelas ini
      // spesifik untuk satu <div> per pengguna di admin/users/page.tsx.
      // Bug ditemukan lewat audit (14 September 2026): baris admin/users
      // direstyle ke token jeon-ink/app-surface (border-2 border-jeon-ink
      // bg-app-surface, BUKAN lagi border border-border bg-white polos)
      // entah kapan tanpa test ini ikut diperbarui -- selector sebelumnya
      // TIDAK PERNAH cocok apa pun, bikin test timeout 120s dgn pesan
      // generik "browserContext.close: Test ended" yang menyesatkan (sulit
      // dilacak ke akar masalah selector CSS). Dipersempit ke KOMBINASI
      // kelas yang lebih kecil kemungkinan ikut berubah lagi di redesain
      // berikutnya (rounded-xl+shadow-card, bukan border/bg spesifik).
      const targetRow = adminPage.locator("div.rounded-xl.shadow-card").filter({ hasText: targetUsername });
      await expect(targetRow.getByRole("button", { name: "Tangguhkan" })).toBeVisible({ timeout: 10000 });
      await targetRow.getByRole("button", { name: "Tangguhkan" }).click();
      // handleToggleSuspend (app/admin/users/page.tsx) menampilkan popup
      // konfirmasi SweetAlert2 SEBELUM benar-benar memanggil suspendUser --
      // pola identik "Cabut akses" di team.spec.ts. Klik "Tangguhkan" saja
      // cuma membuka popup ini, belum mengeksekusi apa pun -- tanpa baris
      // ini status tidak pernah berubah dan assertion berikutnya timeout.
      await adminPage.getByRole("button", { name: "Ya, Tangguhkan" }).click();
      await expect(targetRow.getByRole("button", { name: "Aktifkan" })).toBeVisible({ timeout: 10000 });
      // Dipersempit ke targetRow -- getByText("ditangguhkan") halaman-penuh
      // juga cocok dgn opsi filter dropdown "Ditangguhkan" (case-insensitive
      // default Playwright), strict-mode violation kalau tidak dipersempit.
      await expect(targetRow.getByText("ditangguhkan")).toBeVisible();

      // Akun yang ditangguhkan langsung ditolak di LOGIN BERIKUTNYA (dicek
      // di sana, bukan di setiap request -- lihat AuthHandler.Login). Ini
      // bukan lewat loginAs()/registerAndLogin() (yang menganggap sukses
      // sebagai satu-satunya hasil valid) karena di sini kegagalan justru
      // yang diharapkan -- tapi bucket rate-limit auth tetap DIBAGI dengan
      // helper itu, jadi tetap perlu direset manual di sini supaya toast
      // "terlalu banyak permintaan" tidak keliru dikira bukti suspend.
      resetLocalAuthRateLimit();
      await targetPage.goto("/login");
      await targetPage.locator('input[type="email"]').fill(targetEmail);
      await targetPage.locator('input[type="password"]').fill("Password123!");
      await targetPage.getByRole("button", { name: "Masuk", exact: true }).click();
      await expect(targetPage.getByText("akun ini sedang ditangguhkan, hubungi admin")).toBeVisible({ timeout: 10000 });
      await expect(targetPage).not.toHaveURL(/\/dashboard$/);

      // Admin mengaktifkan kembali -> login langsung normal lagi.
      await adminPage.getByRole("button", { name: "Aktifkan" }).click();
      await adminPage.getByRole("button", { name: "Ya, Aktifkan" }).click();
      await expect(adminPage.getByRole("button", { name: "Tangguhkan" })).toBeVisible({ timeout: 10000 });

      resetLocalAuthRateLimit();
      await targetPage.getByRole("button", { name: "Masuk", exact: true }).click();
      await targetPage.waitForURL("**/dashboard", { timeout: 10000 });
    } finally {
      await targetContext.close();
      await adminContext.close();
    }
  });
});
