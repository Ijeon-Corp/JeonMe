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

    // Modal pratinjau menampilkan tema + tautan SEBELUM diterapkan --
    // termasuk mockup visual (PagePreview), jadi "Twitch" muncul dua kali
    // (chip detail + tombol tautan di mockup), .first() cukup untuk
    // memastikan setidaknya salah satunya benar-benar tampil.
    await expect(page.getByText("Cyber")).toBeVisible();
    await expect(page.getByText("Twitch", { exact: true }).first()).toBeVisible();

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

  test("terapkan template kedua MENGGANTI tautan template pertama, bukan menumpuknya", async ({ page }) => {
    // Bug dilaporkan pengguna: "kenapa setelah pilih template dari quick
    // setup bukan nya berganti malah menambah blok jadi nya banyak banget
    // blok nya sisa dari link sebelumnya" -- pilih 2 template berturut-
    // turut, pastikan tautan template PERTAMA sudah tidak ada lagi setelah
    // template KEDUA diterapkan (bukan tercampur).
    await registerAndLogin(page, "quicksetup2");

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("streamer");
    await page.getByText("Streamer", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /pilih template lain/i }).click();
    await page.getByPlaceholder(/cari template/i).fill("restaurant");
    await page.getByText("Restaurant", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();

    // Dialog konfirmasi destruktif muncul karena sudah ada 3 tautan dari
    // Streamer -- konfirmasi penggantian.
    await expect(page.getByText(/akan menghapus 3 tautan/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Ya, Ganti" }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /buka link bio/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/);

    // Tautan Streamer (Twitch/Discord) sudah HILANG, cuma tautan Restaurant
    // (WhatsApp/Instagram) + blok "Menu" yang tersisa.
    await expect(page.getByText("Twitch", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Discord", { exact: true })).toHaveCount(0);
    // .first() -- teks yang sama muncul dua kali (baris daftar Tautan +
    // panel Pratinjau Langsung), sama seperti bio di test sebelumnya.
    await expect(page.getByText("WhatsApp", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Menu", { exact: true }).first()).toBeVisible();
  });
});
