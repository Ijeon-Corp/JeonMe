import { test, expect, Page } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Dashboard Redesign v2: halaman Tim jadi bertab (Anggota/Undangan/
// Aktivitas, dashboard/team/page.tsx) -- tiap section HANYA dirender di
// tabnya sendiri (`teamTab === "invites"` dkk), BUKAN semua tampil
// sekaligus di satu halaman datar seperti versi lama yang test ini
// awalnya ditulis untuk itu. Form undang ada di "Undangan", daftar
// anggota+role di "Anggota", riwayat aktivitas (formatAuditEntry --
// "Mengundang X sebagai Y", "Mengubah role...", "Mencabut akses...",
// "X menerima undangan") HANYA muncul di "Aktivitas".
async function goToTab(p: Page, tabName: "Anggota" | "Undangan" | "Aktivitas") {
  await p.getByRole("tab", { name: tabName }).click();
}

test.describe("Pengaturan: Tim & Kolaborator", () => {
  test("undang lewat username akun existing, ubah role, dan riwayat aktivitas tercatat", async ({ page, browser }) => {
    const { username: ownerUsername } = await registerAndLogin(page, "teamowner");

    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    try {
      // Modul Settings §4 acceptance criteria: undang akun yang SUDAH ada
      // (lewat username, bukan email) tanpa syarat "belum terdaftar".
      const { username: collabUsername, email: collabEmail } = await registerAndLogin(collabPage, "teamcollab");

      await page.goto("/dashboard/team");
      await goToTab(page, "Undangan");
      await page.getByPlaceholder("email@contoh.com atau username").fill(collabUsername);
      await page.getByLabel("Role kolaborator baru").selectOption("content_admin");
      await page.getByRole("button", { name: "Kirim Undangan" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Undangan dikirim." })).toBeVisible();

      // collabEmail tampil sebagai baris tersendiri di daftar "Anggota"
      // (status "invited") -- BUKAN di tab "Undangan" (form undang tidak
      // punya daftar "baru saja diundang" terpisah).
      await goToTab(page, "Anggota");
      await expect(page.getByText(collabEmail, { exact: true })).toBeVisible();
      // Baris riwayat "Mengundang {email} sebagai {role}" (formatAuditEntry)
      // hanya ada di tab "Aktivitas".
      await goToTab(page, "Aktivitas");
      await expect(page.getByText(/Mengundang .* sebagai Admin Konten/)).toBeVisible();

      await collabPage.goto("/dashboard/team");
      await goToTab(collabPage, "Undangan");
      const inviteSection = collabPage.locator("section", { has: collabPage.getByText("Undangan untuk Saya") });
      await expect(inviteSection.getByText(`@${ownerUsername}`)).toBeVisible();
      await expect(inviteSection.getByText("Admin Konten (Tautan & Desain)")).toBeVisible();
      await collabPage.getByRole("button", { name: "Terima" }).click();
      // Perbaikan UX kedua alur kolaborator (12 September 2026, laporan
      // pengguna "masih tidak tau alur member... setelah accept dimana
      // bisa edit"): tab OTOMATIS pindah ke "Anggota" begitu diterima
      // (BUKAN tetap di "Undangan"), section baru "Akun yang Bisa Kamu
      // Kelola" langsung terlihat di situ dgn tombol aksi "Kelola
      // Sekarang" -- assertion lama ("@owner tidak lagi terlihat di mana
      // pun") sudah usang sejak fitur ini ada (@owner SEKARANG memang
      // sengaja tampil lagi, di section baru ini).
      await expect(collabPage.getByRole("tab", { name: "Anggota", exact: true })).toHaveAttribute("aria-selected", "true");
      const managedSection = collabPage.locator("section", { has: collabPage.getByRole("heading", { name: "Akun yang Bisa Kamu Kelola" }) });
      await expect(managedSection.getByText(`@${ownerUsername}`, { exact: true })).toBeVisible();

      // page.reload() mengembalikan teamTab ke default ("Anggota").
      await page.reload();
      await goToTab(page, "Aktivitas");
      await expect(page.getByText(/Menerima undangan|menerima undangan/)).toBeVisible();

      await goToTab(page, "Anggota");
      const roleSelect = page.getByLabel(`Role ${collabEmail}`);
      await roleSelect.selectOption("full_access");
      await expect(page.getByRole("status").filter({ hasText: "diperbarui" })).toBeVisible();
      await goToTab(page, "Aktivitas");
      await expect(page.getByText(/Mengubah role .* ke Akses Penuh/)).toBeVisible();

      // Konfirmasi "Cabut akses" sekarang lewat popup SweetAlert2 kustom
      // (tema "kemenangan cepat"), BUKAN lagi window.confirm() native --
      // page.once("dialog", ...) tidak akan pernah terpicu, test menunggu
      // sampai timeout tanpa pesan jelas. Klik tombol "Ya, Cabut" di
      // popup itu langsung. Tombol ini ada di baris anggota (tab
      // "Anggota"), bukan tab "Aktivitas" tempat kita baru saja mengecek.
      await goToTab(page, "Anggota");
      await page.getByTitle("Cabut akses").click();
      await page.getByRole("button", { name: "Ya, Cabut" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Akses kolaborator dicabut." })).toBeVisible();
      await goToTab(page, "Aktivitas");
      await expect(page.getByText(/Mencabut akses/)).toBeVisible();
    } finally {
      await collabContext.close();
    }
  });

  test("undang username yang tidak ada ditolak", async ({ page }) => {
    await registerAndLogin(page, "teambadinv");

    await page.goto("/dashboard/team");
    await goToTab(page, "Undangan");
    await page.getByPlaceholder("email@contoh.com atau username").fill("username-tidak-pernah-ada-sekali-ini");
    await page.getByRole("button", { name: "Kirim Undangan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "tidak ditemukan" })).toBeVisible();
  });
});
