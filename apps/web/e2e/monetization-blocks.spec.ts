import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Blok monetisasi tambahan (donasi/event) -- shared lintas SEMUA halaman
// satu akun (lihat CLAUDE.md), belum ada cakupan E2E sama sekali
// sebelumnya. Satu akun dipakai untuk semua blok (hemat bucket rate-limit
// auth, lihat catatan panjang di fixtures.ts).
//
// Loyalitas SENGAJA dikeluarkan dari test ini (6 September 2026, permintaan
// langsung pengguna "remove menu royalti dan semua fungsinya" -- menu
// "Loyalitas" dihapus dari dashboard & halaman publik, backend/DB
// dibiarkan hidup untuk kemungkinan diaktifkan lagi nanti).
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe("Blok Monetisasi: Donasi, Event", () => {
  test("kedua blok tersimpan lewat dashboard & tampil di halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "monetize");

    // Donasi.
    const donationTitle = "Traktir Kopi E2E";
    await page.goto("/dashboard/donation");
    await page.getByRole("switch", { name: "Aktifkan blok dukungan" }).click();
    await page.getByPlaceholder("Traktir aku kopi").fill(donationTitle);
    // .first() -- Gap #4 benchmark kompetitif menambah field target donasi
    // yang JUGA type="number" (input[placeholder="Target nominal..."]) di
    // halaman yang sama, jadi selector polos sekarang ambigu. Nominal
    // Minimum selalu lebih dulu di urutan DOM.
    await page.locator('input[type="number"]').first().fill("15000");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pengaturan disimpan.")).toBeVisible({ timeout: 10000 });

    // Event -- tanggal besok, cukup jauh dari sekarang supaya tidak flaky
    // kalau test lambat jalan di sekitar tengah malam.
    const eventName = "Workshop E2E";
    const start = new Date(Date.now() + 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);
    await page.goto("/dashboard/events");
    // DUA tombol "Buat Event" coexist by design pada halaman kosong: PageHeader
    // primaryAction (template Manager, SPEC §7.2/§14 Phase 5) DAN CTA di dalam
    // EmptyState (redesain 1 Sept 2026) -- keduanya sama-sama cuma memanggil
    // setAdding(true), jadi .first() aman dipakai untuk membuka form create.
    await page.getByRole("button", { name: "Buat Event" }).first().click();
    await page.getByPlaceholder("Workshop Fotografi Dasar").fill(eventName);
    // Dua input number di form ini (Harga Tiket, Kuota Peserta) -- .first()
    // supaya tidak strict-mode violation.
    await page.locator('input[type="number"]').first().fill("20000");
    const eventDateInputs = page.locator('input[type="datetime-local"]');
    await eventDateInputs.nth(0).fill(toDatetimeLocal(start));
    await eventDateInputs.nth(1).fill(toDatetimeLocal(end));
    // Scope ke <form> -- form create ini TETAP tampil bersamaan dengan tombol
    // PageHeader & EmptyState (event list masih kosong sampai submit sukses),
    // jadi selector polos "Buat Event" sekarang match 3 elemen sekaligus.
    await page.locator("form").getByRole("button", { name: "Buat Event", exact: true }).click();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10000 });
    // Event baru is_active=false secara default -- pola sama dengan produk
    // digital (harus diaktifkan manual sebelum tampil publik), ditemukan
    // lewat percobaan pertama test ini (event tersimpan tapi tidak pernah
    // tampil di halaman publik).
    await page.getByRole("switch", { name: `Aktifkan ${eventName}` }).click();

    // Backend Redis "page:<username>" cache (TTL 30 detik) diinvalidasi tiap
    // mutasi blok di atas (donation.go/event.go, lihat
    // invalidateUserPageCache di cache.go) -- toPass jaga-jaga kalau ada
    // yang belum sempat kepropagasi.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(donationTitle)).toBeVisible({ timeout: 3000 });
      await expect(page.getByText(eventName)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [3000] });
  });
});
