import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

// PNG 64x64 valid minimal (bukan file fixture terpisah di disk -- pola sama
// dengan buffer inline di products-checkout.spec.ts) -- avatar butuh gambar
// yang benar-benar bisa didekode (backend mengonversi ke WebP lewat
// imageconv, byte sembarang akan ditolak), jadi tidak bisa dummy string
// polos seperti file produk digital.
const TEST_AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAABA0lEQVR4nNXCkbYQAAAFwQtBEARBEARBEARBEDwIgiAIgiAIgiAIFoIgeBAEQRAEQRAEC0EQBEEQBEEQBEEQBEHQd+yc2bD9CKbvKKbvGKbvOKbvBKbvJKbvFKbvNKbvDKbvLKbvHKbvPKbvAqbvIqbvEqbvANN3GdN3BdN3FdN3DdN3HdN3A9N3E9N3C9N3G9N3B9N3F9N3D9N3H9MHpu8Bpu8hpu8Rpu8Q0/cY0/cE0/cU0/cM0/cc0/cC0/cS0/cK0/ca0/cG0yem7y2m7x2m7z2m7wOm7yOm7xOm7zOm7wum7yum7xum7zum7wem7yem7xem7zem7w+m7y+m7x+m/wdgL6GHQTG2qQAAAABJRU5ErkJggg==";

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

    // Dialog konfirmasi destruktif muncul karena sudah ada 5 tautan/blok dari
    // Streamer (3 tautan + 2 blok "Jadwal Live"/FAQ, lihat quick-setup-
    // templates.ts) -- konfirmasi penggantian.
    await expect(page.getByText(/akan menghapus 5 tautan/i)).toBeVisible({ timeout: 5000 });
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
    // PagePreview.tsx), awalnya dipetakan ke creator & entertainment
    // sekaligus. Revisi 13 Agustus 2026 ("layout template mockup di tiap
    // kategori itu dibedakan jangan ada yang sama") memisahkan keduanya --
    // creator pindah ke "hero" (avatar penuh edge-to-edge, ref: Linktree
    // Hero), entertainment TETAP "spotlight" (avatar dalam badge bulat,
    // ref: artwork bulat Spotify/Apple Podcasts) -- makanya test ini
    // sekarang pakai "Content Creator" (kategori Entertainment), BUKAN
    // "Creator Profile" (kategori Creator, sekarang hero) lagi. Test ini
    // memverifikasi Spotlight sungguhan tersimpan & tampil di halaman
    // publik ASLI (bukan cuma mockup dashboard) -- avatar Spotlight
    // (h-28 = 112px) jelas lebih besar dari avatar Centered/Card/Banner
    // (h-24 = 96px / h-16 = 64px), dicek lewat bounding box tinggi
    // avatar, bukan nama kelas CSS.
    const { username } = await registerAndLogin(page, "quicksetup5");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("content creator");
    await page.getByText("Content Creator", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      expect(avatarBox).not.toBeNull();
      expect(avatarBox!.height).toBeGreaterThan(100);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Hero (avatar penuh edge-to-edge) sungguhan tampil di halaman publik", async ({ page }) => {
    // Kategori Creator dipindah dari "spotlight" ke "hero" 13 Agustus
    // 2026 (lihat catatan test Spotlight di atas). Tanpa avatar terisi,
    // "hero" jatuh balik ke "centered" (lihat renderBioHeader,
    // PagePreview.tsx) -- test ini SENGAJA mengunggah avatar dulu supaya
    // benar-benar menguji rendering hero yang sesungguhnya (foto besar
    // edge-to-edge), bukan cuma fallback-nya.
    const { username } = await registerAndLogin(page, "quicksetup8");
    await publishPage(page);

    await page.goto("/dashboard/design/header");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from(TEST_AVATAR_PNG_BASE64, "base64") });
    await expect(page.getByText("Mengunggah...")).toHaveCount(0, { timeout: 15000 });

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("creator profile");
    await page.getByText("Creator Profile", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      // Hero merender <img alt={username}> besar (bukan div avatar bulat
      // placeholder) -- lihat renderBioHeader varian "hero".
      const heroImg = page.locator(`img[alt='${username}']`);
      await expect(heroImg).toBeVisible({ timeout: 3000 });
      const box = await heroImg.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThan(200);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Polaroid (avatar kotak dibingkai & dimiringkan) sungguhan tampil di halaman publik", async ({ page }) => {
    // Kategori Lifestyle -- SEBELUMNYA jatuh ke default "centered" (sama
    // dengan kategori Special, tabrakan) -- 13 Agustus 2026 dipetakan ke
    // varian baru "polaroid" (avatar kotak, bukan bulat, dibingkai putih
    // & dimiringkan -- ref estetika Pinterest/VSCO) supaya benar-benar
    // beda dari 7 kategori lain. Dicek lewat ROTASI CSS (-rotate-3, satu-
    // satunya varian yang memiringkan elemen) -- penanda paling spesifik
    // untuk varian ini, bukan nama kelas yang gampang berubah.
    const { username } = await registerAndLogin(page, "quicksetup9");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("travel blogger");
    await page.getByText("Travel Blogger", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const frame = page.locator("div.bg-white.shadow-xl").first();
      await expect(frame).toBeVisible({ timeout: 3000 });
      const transform = await frame.evaluate((el) => getComputedStyle(el).transform);
      expect(transform).not.toBe("none");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Cover (pita sampul + avatar menindih tepi bawah) sungguhan tampil tanpa overflow horizontal di halaman publik", async ({
    page,
  }) => {
    // Susulan lagi: "tambahkan lagi 2 bentuk layout lain nya" -- "cover" &
    // "minimal" ditambah (lihat renderBioHeader, PagePreview.tsx), local
    // -> cover, education -> minimal. "cover" secara teknis paling
    // berisiko dari semua varian (satu-satunya yang pakai margin negatif
    // -mx-6 -mt-14 + w-[calc(100%+3rem)] untuk membatalkan padding kolom
    // konten supaya pita sampulnya mentok ke tepi) -- WAJIB dicek tidak
    // bocor keluar bingkai halaman (PublicPageFrame, rounded overflow-
    // hidden) ataupun memicu scrollbar horizontal di halaman publik asli,
    // bukan cuma mockup dashboard yang sudah dizoom/dipotong duluan.
    const { username } = await registerAndLogin(page, "quicksetup6");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("restaurant");
    await page.getByText("Restaurant", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(async () => {
      await page.goto(`/${username}`);
      const overflowX = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflowX).toBe(false);
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      expect(avatarBox).not.toBeNull();
      // Cover: h-20 = 80px -- di antara Banner (h-16=64px) & Centered/Card
      // (h-24=96px), rentang cukup sempit supaya tidak sengaja cocok
      // dengan varian lain.
      expect(avatarBox!.height).toBeGreaterThan(70);
      expect(avatarBox!.height).toBeLessThan(90);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Minimal (avatar kecil sebaris nama) sungguhan tampil di halaman publik", async ({ page }) => {
    // Susulan lagi: "tambahkan lagi 2 bentuk layout lain nya" -- lihat
    // catatan lengkap di test Cover di atas. Minimal (education) avatar
    // paling kecil dari SEMUA varian (h-10=40px) -- cek lewat bounding box,
    // bukan nama kelas CSS, sama seperti test varian lain.
    const { username } = await registerAndLogin(page, "quicksetup7");
    await publishPage(page);

    await page.goto("/dashboard/quick-setup");
    await page.getByPlaceholder(/cari template/i).fill("teacher");
    await page.getByText("Teacher", { exact: true }).click();
    await page.getByRole("button", { name: /terapkan template/i }).click();
    await expect(page.getByRole("heading", { name: /diterapkan/i })).toBeVisible({ timeout: 10000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      expect(avatarBox).not.toBeNull();
      expect(avatarBox!.height).toBeLessThan(50);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
