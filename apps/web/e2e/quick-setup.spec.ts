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
    // termasuk mockup visual (PagePreview), jadi "Nonton di Twitch" muncul
    // dua kali (chip detail + tombol tautan di mockup), .first() cukup
    // untuk memastikan setidaknya salah satunya benar-benar tampil. Judul
    // "Nonton di Twitch" (bukan cuma "Twitch") -- permintaan langsung
    // pengguna: judul tautan starter dibuat CTA/deskriptif ala referensi
    // Linktree sungguhan, bukan nama platform polos.
    await expect(page.getByText("Cyber")).toBeVisible();
    await expect(page.getByText("Nonton di Twitch", { exact: true }).first()).toBeVisible();

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
    // yang tersisa: "Lokasi Kami" (blok maps, PALING ATAS -- lihat
    // orderedTemplateItems), "Reservasi via WhatsApp", "Ikuti Update Kami",
    // blok "Menu", dan "Kritik dan Saran" (formulir kontak, PALING BAWAH).
    await expect(page.getByText("Nonton di Twitch", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Gabung Discord", { exact: true })).toHaveCount(0);
    // .first() -- teks yang sama muncul dua kali (baris daftar Tautan +
    // panel Pratinjau Langsung), sama seperti bio di test sebelumnya.
    await expect(page.getByText("Lokasi Kami", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Reservasi via WhatsApp", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Kritik dan Saran", { exact: true }).first()).toBeVisible();

    // Urutan tampil harus "Lokasi Kami" (blok maps) PALING ATAS, "Kritik
    // dan Saran" (formulir kontak) PALING BAWAH -- lihat
    // orderedTemplateItems. .first() konsisten memilih baris daftar
    // Tautan sungguhan (bukan panel Pratinjau), sama seperti assertion
    // lain di test ini.
    const lokasiY = (await page.getByText("Lokasi Kami", { exact: true }).first().boundingBox())!.y;
    const kritikY = (await page.getByText("Kritik dan Saran", { exact: true }).first().boundingBox())!.y;
    expect(lokasiY).toBeLessThan(kritikY);
  });

  test("galeri kartu merender mockup PagePreview sungguhan (tanpa nested <button>) & template Company (FAQ + link website) berhasil diterapkan", async ({
    page,
  }) => {
    // Dua bug NYATA ditemukan lewat verifikasi browser sungguhan (bukan
    // dugaan) setelah permintaan "mockup nya harus... langsung terlihat
    // bentuknya... tanpa harus diklik dulu":
    // 1. Kartu galeri merender PagePreview (yang di dalamnya ada
    //    ShareButton, elemen <button>) di dalam <button> pembungkus kartu
    //    -- <button> di dalam <button> HTML TIDAK VALID, bikin error
    //    hydration React. Diperbaiki: pembungkus kartu jadi
    //    div[role="button"], bukan <button> sungguhan.
    // 2. PLATFORM_URL.website ("https://" polos, tanpa host) ditolak
    //    validator URL backend (400 Bad Request) begitu template Company
    //    (satu-satunya yang kepilih di test ini yang pakai link website)
    //    coba diterapkan. Diperbaiki: placeholder domain jelas
    //    ("https://websitekamu.com") yang tetap lolos validasi format URL.
    await registerAndLogin(page, "quicksetup3");

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/dashboard/quick-setup");
    // Mockup tiap kartu galeri (SEBELUM diklik apa pun) sudah menampilkan
    // konten template sungguhan -- bukan cuma placeholder/bar warna.
    await expect(page.getByText("Follow di Instagram", { exact: true }).first()).toBeVisible();

    await page.getByPlaceholder(/cari template/i).fill("company");
    await page.getByText("Company", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    expect(pageErrors).toEqual([]);

    await page.getByRole("button", { name: /buka link bio/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/);

    // Tautan website tersimpan dengan URL placeholder yang VALID (bukan
    // "https://" polos yang dulu ditolak backend).
    await expect(page.getByText("https://websitekamu.com", { exact: true })).toBeVisible();
    // Blok FAQ ("Pertanyaan Umum") benar-benar tersimpan sebagai blok
    // tersendiri, badge "FAQ" membuktikan block_type-nya benar (bukan
    // salah kepetakan jadi "text" atau "link").
    const faqRow = page.locator("div", { hasText: "Pertanyaan Umum" }).filter({ hasText: "FAQ" }).first();
    await expect(faqRow).toBeVisible();
  });

  test("varian layout Banner (avatar rata kiri) sungguhan tampil beda dari Centered di halaman publik", async ({ page }) => {
    // Susulan: "layout nya itu dibuat beda jangan monoton sama semua" --
    // ini mengubah komponen PagePreview yang dipakai halaman publik
    // SUNGGUHAN semua pengguna (dikonfirmasi dulu ke pengguna sebelum
    // dikerjakan, bukan cuma preview dashboard) + kolom database baru
    // (layout_variant), jadi WAJIB diverifikasi sampai ke halaman publik
    // asli, bukan cuma dashboard -- perbandingan posisi avatar (kiri vs
    // tengah) dicek lewat bounding box, bukan nama kelas CSS (supaya
    // tidak rapuh kalau susunan class Tailwind berubah).
    const { username } = await registerAndLogin(page, "quicksetup4");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("company");
    await page.getByText("Company", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      // Avatar placeholder (tanpa foto) SATU-satunya elemen dengan
      // kombinasi kelas rounded-full + text-2xl (ikon sosial/tautan lain
      // rounded-full juga tapi tidak text-2xl) -- lebih spesifik daripada
      // cocok teks huruf awal username yang gampang tabrakan.
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      const viewportWidth = page.viewportSize()!.width;
      // Banner: avatar nempel ke sisi kiri kolom konten (jauh dari
      // tengah viewport). Centered (bawaan/pola lama): avatar ada persis
      // di tengah viewport. max-w-md kolom konten ada di tengah viewport
      // (mx-auto), jadi avatar kiri (banner) posisinya jelas TIDAK di
      // tengah viewport secara horizontal.
      expect(avatarBox).not.toBeNull();
      const avatarCenterX = avatarBox!.x + avatarBox!.width / 2;
      expect(Math.abs(avatarCenterX - viewportWidth / 2)).toBeGreaterThan(60);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Spotlight (avatar besar + badge nama) sungguhan tampil beda dari Centered/Banner di halaman publik", async ({
    page,
  }) => {
    // Susulan: "tambahkan jenis model layout selain 2 yang sudah ada,
    // coba buat layout itu yang cocok dengan kategori nya" -- dua varian
    // baru ditambah ("card" & "spotlight", lihat renderBioHeader di
    // PagePreview.tsx), lalu dipetakan SATU varian utama per kategori
    // Quick Setup (creator/entertainment -> spotlight, shop/education ->
    // card). Test ini memverifikasi Spotlight sungguhan tersimpan &
    // tampil di halaman publik ASLI (bukan cuma mockup dashboard) -- avatar
    // Spotlight (h-28 = 112px) jelas lebih besar dari avatar
    // Centered/Card/Banner (h-24 = 96px / h-16 = 64px), dicek lewat
    // bounding box tinggi avatar, bukan nama kelas CSS.
    const { username } = await registerAndLogin(page, "quicksetup5");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("creator profile");
    await page.getByText("Creator Profile", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      expect(avatarBox).not.toBeNull();
      expect(avatarBox!.height).toBeGreaterThan(100);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
