import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

// Blok monetisasi tambahan (donasi/event/loyalitas) -- shared lintas
// SEMUA halaman satu akun (lihat CLAUDE.md), belum ada cakupan E2E sama
// sekali sebelumnya. Satu akun dipakai untuk semua blok (hemat bucket rate-
// limit auth, lihat catatan panjang di fixtures.ts).
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe("Blok Monetisasi: Donasi, Event, Loyalitas", () => {
  test("ketiga blok tersimpan lewat dashboard & tampil di halaman publik", async ({ page }) => {
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
    await page.getByRole("button", { name: "Buat Event" }).click();
    await page.getByPlaceholder("Workshop Fotografi Dasar").fill(eventName);
    // Dua input number di form ini (Harga Tiket, Kuota Peserta) -- .first()
    // supaya tidak strict-mode violation.
    await page.locator('input[type="number"]').first().fill("20000");
    const eventDateInputs = page.locator('input[type="datetime-local"]');
    await eventDateInputs.nth(0).fill(toDatetimeLocal(start));
    await eventDateInputs.nth(1).fill(toDatetimeLocal(end));
    await page.getByRole("button", { name: "Buat Event", exact: true }).click();
    await expect(page.getByText(eventName)).toBeVisible({ timeout: 10000 });
    // Event baru is_active=false secara default -- pola sama dengan produk
    // digital (harus diaktifkan manual sebelum tampil publik), ditemukan
    // lewat percobaan pertama test ini (event tersimpan tapi tidak pernah
    // tampil di halaman publik).
    await page.getByRole("switch", { name: `Aktifkan ${eventName}` }).click();

    // Loyalitas: aktifkan program (reward publikasi di luar cakupan test ini
    // -- widget "Poin Loyalitas" di halaman publik tidak bergantung pada ada
    // tidaknya reward, cuma pada loyalty_active).
    await page.goto("/dashboard/loyalty");
    await page.getByRole("switch", { name: "Aktifkan program loyalitas" }).click();
    // Toggle ini HANYA mengubah state lokal (setSettings) -- beda dari
    // pola Toggle lain di app ini yang auto-save di onChange, harus disusul
    // klik "Simpan Pengaturan" eksplisit (ditemukan lewat percobaan pertama
    // test ini: toggle ter-klik tapi tidak pernah tersimpan ke server).
    await page.getByRole("button", { name: "Simpan Pengaturan" }).click();

    // Backend Redis "page:<username>" cache (TTL 30 detik) diinvalidasi tiap
    // mutasi blok di atas (donation.go/event.go, lihat
    // invalidateUserPageCache di cache.go) -- toPass jaga-jaga kalau ada
    // yang belum sempat kepropagasi.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(donationTitle)).toBeVisible({ timeout: 3000 });
      await expect(page.getByText(eventName)).toBeVisible({ timeout: 3000 });
      await expect(page.getByText("Poin Loyalitas")).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [3000] });
  });
});
