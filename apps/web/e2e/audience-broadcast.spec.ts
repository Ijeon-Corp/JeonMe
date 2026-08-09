import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

// Gap #3 dari laporan benchmark kompetitif (permintaan langsung pengguna,
// 9 Agustus 2026): Audiens sebelumnya cuma capture form + ekspor CSV,
// sekarang bisa kirim broadcast email sungguhan ke subscriber. Test ini
// menempuh alur PENUH: aktifkan blok pengumpulan lead, pengunjung
// sungguhan mendaftar lewat form di halaman publik, kreator kirim
// broadcast, lalu verifikasi status berubah jadi "Terkirim" (dikerjakan
// ASINKRON oleh worker asynq -- lihat catatan e2e/README.md soal proses
// worker terpisah harus berjalan).
test.describe("Broadcast Email Audiens", () => {
  test("subscriber mendaftar lewat form publik, kreator kirim broadcast, status jadi terkirim", async ({ page, browser }) => {
    const { username } = await registerAndLogin(page, "broadcast");
    await publishPage(page);

    await page.goto("/dashboard/audience");
    const enableToggle = page.getByRole("switch", { name: "Aktifkan blok pengumpulan lead" });
    if ((await enableToggle.getAttribute("aria-checked")) !== "true") {
      await enableToggle.click();
    }
    await page.getByPlaceholder("Dapatkan info terbaru dariku").fill("Gabung newsletter aku");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Pengaturan disimpan.")).toBeVisible();

    // Pengunjung SUNGGUHAN (browser context terpisah, belum login) mendaftar
    // lewat blok pengumpulan lead di halaman publik -- bukan lewat API
    // langsung, supaya form LeadCaptureForm ikut teruji juga.
    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    try {
      await expect(async () => {
        await visitorPage.goto(`/${username}`);
        await expect(visitorPage.getByPlaceholder("Email kamu")).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 75000, intervals: [5000] });

      await visitorPage.getByPlaceholder("Email kamu").fill("subscriber-e2e@example.com");
      await visitorPage.getByRole("button", { name: "Daftar" }).click();
      await expect(visitorPage.getByText("Berhasil mendaftar. Terima kasih!")).toBeVisible();
    } finally {
      await visitorContext.close();
    }

    await page.reload();
    await expect(page.getByText("Kirim pesan ke 1 subscriber", { exact: false })).toBeVisible({ timeout: 10000 });

    const subjectInput = page.locator('input[placeholder="Subjek email"]');
    await subjectInput.fill("Halo dari Jeonme E2E");
    await page.getByPlaceholder("Isi pesan...").fill("Ini pesan broadcast uji coba.");
    await page.getByRole("button", { name: /Kirim ke 1 Subscriber/ }).click();

    await expect(page.getByText(/Broadcast diantre untuk 1 subscriber/)).toBeVisible({ timeout: 10000 });

    // Worker asynq memproses ASINKRON -- tunggu sent_count menyusul
    // recipient_count (proses worker terpisah harus berjalan, lihat
    // e2e/README.md). BUKAN cuma cek teks badge status "Terkirim" --
    // getByText tanpa exact:true cocok substring case-insensitive, jadi
    // akan false-positive cocok dengan kata "terkirim" di dalam teks
    // "0/1 terkirim · ..." yang SELALU tampil apa pun statusnya. Menunggu
    // "1/1 terkirim" langsung sekaligus menghindari ambiguitas itu DAN
    // menjadi bukti pengiriman sungguhan sukses (sent_count == recipient_count).
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("1/1 terkirim", { exact: false })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30000, intervals: [2000] });
  });
});
