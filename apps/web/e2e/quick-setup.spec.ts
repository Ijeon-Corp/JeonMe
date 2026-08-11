import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

// Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: "buatkan 1
// menu saja seperti quick setup dan user disuruh pilih jenis template...
// template ini bukan hanya visual tapi juga blok layout dll". Satu klik
// "Terapkan Template" harus langsung memasang tema + bio (kalau kosong) +
// tautan starter + blok konten sekaligus, bukan cuma mengganti tampilan.
test.describe("Quick Setup", () => {
  test("terapkan template Streamer langsung mengisi tema, bio, dan tautan starter", async ({ page }) => {
    const { username } = await registerAndLogin(page, "quicksetup");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("streamer");
    await page.getByText("Streamer", { exact: true }).click();

    // Modal pratinjau menampilkan tema + tautan SEBELUM diterapkan.
    await expect(page.getByText("Cyber")).toBeVisible();
    await expect(page.getByText("Twitch", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /buka link bio/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/);

    // Bio tersimpan (sebelumnya kosong -- akun baru dari registerAndLogin).
    // .first() -- teks yang sama muncul dua kali (baris profil + panel
    // Pratinjau Langsung).
    await expect(page.getByText("Live streaming rutin -- mabar yuk!").first()).toBeVisible();

    // Ketiga tautan starter benar-benar tersimpan sebagai baris Tautan
    // sungguhan (bukan cuma UI pratinjau), dengan URL dasar platform yang
    // benar.
    await expect(page.getByText("https://twitch.tv/", { exact: true })).toBeVisible();
    await expect(page.getByText("https://youtube.com/@", { exact: true })).toBeVisible();
    await expect(page.getByText("https://discord.gg/", { exact: true })).toBeVisible();

    // Tema Cyber ikut tersimpan -- terlihat lewat halaman publik (gradien
    // gelap khas tema ini, dicek lewat kelas latar di HTML).
    await expect(async () => {
      await page.goto(`/${username}`);
      const html = await page.content();
      expect(html).toContain("Live streaming rutin");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
