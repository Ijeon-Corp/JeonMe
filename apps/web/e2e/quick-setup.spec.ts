import { test, expect } from "@playwright/test";
import { TEST_IMAGE_PNG_BASE64, registerAndLogin } from "./fixtures";

// Quick Setup -- permintaan langsung pengguna, 11 Agustus 2026: "buatkan 1
// menu saja seperti quick setup dan user disuruh pilih jenis template...
// template ini bukan hanya visual tapi juga blok layout dll". Satu klik
// "Terapkan Template" harus langsung memasang tema + bio (kalau kosong) +
// tautan starter + blok konten sekaligus, bukan cuma mengganti tampilan.
//
// Revisi 27 Agustus 2026 (permintaan langsung pengguna, dicontohkan lewat
// tangkapan layar alur "Microsite" s.id): dirombak jadi wizard 3 langkah
// (pilih kategori -> tab Template/Theme -> generating & auto-redirect).
// Seluruh test di bawah disusulkan mengikuti alur baru ini -- lihat
// catatan lengkap di dashboard/quick-setup/page.tsx.
async function openCategory(page: import("@playwright/test").Page, categoryLabel: string) {
  await page.goto("/dashboard/quick-setup");
  await page.getByRole("button", { name: categoryLabel }).click();
}

test.describe("Quick Setup", () => {
  test("terapkan template Streamer langsung mengisi tema, bio, dan tautan starter", async ({ page }) => {
    const { username } = await registerAndLogin(page, "quicksetup");

    await openCategory(page, "Creator & Personal Brand");
    // Theme tab TERKUNCI sampai template dipilih -- permintaan langsung
    // pengguna: "setelah pilih template user baru bisa pindah ke tab
    // theme (optional)".
    await expect(page.getByRole("button", { name: "Theme", exact: true })).toBeDisabled();

    await page.getByPlaceholder(/cari template/i).fill("streamer");
    await page.getByText("Streamer", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Theme", exact: true })).toBeEnabled();

    // Panel pratinjau persisten (kanan) menampilkan mockup PagePreview
    // SEBENARNYA sebelum diterapkan -- ringkasan teks tema/tautan/blok di
    // bawah pratinjau DIHAPUS (permintaan susulan langsung pengguna:
    // "hilangkan semua ini yang ada di bawah pratinjau, hanya ada tombol
    // terapkan template saja"), jadi cukup cek tautan starter tampil di
    // mockup itu sendiri. Judul "Nonton di Twitch" (bukan cuma "Twitch")
    // -- permintaan langsung pengguna: judul tautan starter dibuat CTA/
    // deskriptif ala referensi Linktree sungguhan, bukan nama platform
    // polos.
    await expect(page.getByText("Nonton di Twitch", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Terapkan Template" }).click();
    // Layar "generating" -> sukses SINGKAT sebelum auto-redirect (pola
    // sama dgn app/auth/instagram/callback) -- dicek di sini supaya
    // membuktikan UI ini sungguhan render, bukan cuma percaya redirect
    // akhirnya terjadi.
    await expect(page.getByText("Template diterapkan!")).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Creator & Personal Brand");
    await page.getByPlaceholder(/cari template/i).fill("streamer");
    await page.getByText("Streamer", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    // Wizard mulai dari awal lagi (step kategori) -- tidak ada lagi
    // "Pilih template lain" karena sudah auto-redirect ke editor.
    await openCategory(page, "Local Business");
    await page.getByPlaceholder(/cari template/i).fill("restaurant");
    await page.getByText("Restaurant", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();

    // Dialog konfirmasi destruktif muncul karena sudah ada 6 tautan/blok dari
    // Streamer (3 tautan + 3 blok "Project Unggulan"/"Jadwal Live"/FAQ,
    // lihat quick-setup-templates.ts) -- konfirmasi penggantian.
    await expect(page.getByText(/akan menghapus 6 tautan/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Ya, Ganti" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Business & Professional");
    // Mockup tiap kartu galeri (SEBELUM diklik apa pun) sudah menampilkan
    // konten template sungguhan -- bukan cuma placeholder/bar warna
    // ("Agency", template lain di kategori yang sama, pakai link()
    // instagram berlabel default).
    await expect(page.getByText("Follow di Instagram", { exact: true }).first()).toBeVisible();

    await page.getByPlaceholder(/cari template/i).fill("company");
    await page.getByText("Company", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    expect(pageErrors).toEqual([]);

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

    await openCategory(page, "Business & Professional");
    await page.getByPlaceholder(/cari template/i).fill("company");
    await page.getByText("Company", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Entertainment");
    await page.getByPlaceholder(/cari template/i).fill("content creator");
    await page.getByText("Content Creator", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await page.goto("/dashboard/design/header");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("Mengunggah...")).toHaveCount(0, { timeout: 15000 });

    await openCategory(page, "Creator & Personal Brand");
    await page.getByPlaceholder(/cari template/i).fill("creator profile");
    await page.getByText("Creator Profile", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Lifestyle");
    await page.getByPlaceholder(/cari template/i).fill("travel blogger");
    await page.getByText("Travel Blogger", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Local Business");
    await page.getByPlaceholder(/cari template/i).fill("restaurant");
    await page.getByText("Restaurant", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

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

    await openCategory(page, "Education");
    await page.getByPlaceholder(/cari template/i).fill("teacher");
    await page.getByText("Teacher", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const avatarBox = await page.locator("div.rounded-full.text-2xl").first().boundingBox();
      expect(avatarBox).not.toBeNull();
      expect(avatarBox!.height).toBeLessThan(50);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("template diterapkan ke Bio juga menyinkronkan tema Halaman Toko yang sudah ada", async ({ page }) => {
    // Toko & Bio SEKARANG halaman terpisah (grid Produk dihapus total dari
    // Bio, lihat products-checkout.spec.ts) -- permintaan langsung
    // pengguna, 19 Agustus 2026: "karena page link bio dan toko terpisah
    // saya mau buatkan juga template quick setup untuk page toko nya".
    // Template pertama ("Online Store", tema Peach) bikin Toko AUTO lewat
    // produk contohnya (ensureProdukPage, backend). Template KEDUA ("Small
    // Business", tema Mint) sendiri tidak menyebut Toko sama sekali di
    // datanya -- tapi applyTemplate (dashboard/quick-setup/page.tsx) tetap
    // HARUS menyamakan tema Toko yang SUDAH ADA itu ke Mint juga, dicek
    // langsung di halaman Toko publik /p/{username}, bukan cuma Bio.
    const { username } = await registerAndLogin(page, "quicksetup10");

    await openCategory(page, "Online Shop");
    await page.getByPlaceholder(/cari template/i).fill("online store");
    await page.getByText("Online Store", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    // Tema Peach -- "bg-gradient-to-b from-orange-50 via-amber-50 to-white"
    // (lib/page-themes.ts) -- ikut tersalin ke Toko AUTO begitu terbuat
    // (ensureProdukPage menyalin tema Bio saat itu juga), jadi harusnya
    // SUDAH Peach sejak awal, sebelum template kedua di bawah sama sekali.
    await expect(async () => {
      await page.goto(`/p/${username}`);
      const html = await page.content();
      expect(html).toContain("from-orange-50");
    }).toPass({ timeout: 75000, intervals: [5000] });

    await openCategory(page, "Online Shop");
    await page.getByPlaceholder(/cari template/i).fill("small business");
    await page.getByText("Small Business", { exact: true }).click();

    await page.getByRole("button", { name: "Terapkan Template" }).click();
    // Dialog konfirmasi destruktif muncul (sudah ada tautan dari Online
    // Store sebelumnya).
    await page.getByRole("button", { name: "Ya, Ganti" }).click();
    // Layar generating memberi tahu Toko ikut disesuaikan (tokoSynced,
    // ditentukan applyTemplate saat itu juga -- BEDA dari catatan
    // informatif SEBELUM apply yang dulu ada di panel ringkasan, sudah
    // dihapus bersama seluruh ringkasan itu).
    await expect(page.getByText(/tema halaman toko-mu juga sudah ikut disesuaikan/i)).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    // Tema Mint -- "bg-gradient-to-br from-emerald-800 via-teal-800 to-cyan-800"
    // -- Toko yang SUDAH ADA (bukan baru dibuat kali ini) ikut berubah,
    // membuktikan updateExtraPage benar-benar dipanggil, bukan cuma
    // mengandalkan penyalinan awal ensureProdukPage (yang tidak akan
    // terpicu lagi -- Toko-nya sudah ada dari langkah sebelumnya).
    await expect(async () => {
      await page.goto(`/p/${username}`);
      const html = await page.content();
      expect(html).toContain("from-emerald-800");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  // 7 varian layout baru -- permintaan langsung pengguna, 20 Agustus 2026:
  // "saya mau tambahkan jadi total 15 layout yang berbeda ambil referensi
  // dari web serupa dan buat unik dan sesuai dengan kategorinya". Tidak
  // semua 7 varian baru dapat test tersendiri di sini (delapan varian lama
  // sudah representatif soal POLA verifikasi -- bounding box/computed
  // style, bukan nama kelas CSS) -- 3 di bawah ini dipilih mewakili 3 gaya
  // implementasi paling berbeda (dua kolom, kartu berdivider, gambar
  // terkungkung) supaya regresi paling berisiko tetap terjaga.
  test("varian layout Split (2 kolom, avatar persegi rata kiri) sungguhan tampil di halaman publik", async ({ page }) => {
    // "split" dipetakan ke Consultant (kategori Business) -- avatar KOTAK
    // (rounded-2xl, BUKAN rounded-full seperti 8 varian lama) jadi
    // selector avatar placeholder di test lain (div.rounded-full.text-2xl)
    // TIDAK cocok di sini, sengaja pakai div.rounded-2xl.text-2xl supaya
    // ikut membuktikan bentuknya benar-benar persegi, bukan cuma posisi.
    const { username } = await registerAndLogin(page, "quicksetup11");

    await openCategory(page, "Business & Professional");
    await page.getByPlaceholder(/cari template/i).fill("consultant");
    await page.getByText("Consultant", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const avatarBox = await page.locator("div.rounded-2xl.text-2xl").first().boundingBox();
      const viewportWidth = page.viewportSize()!.width;
      expect(avatarBox).not.toBeNull();
      // Rata kiri (sama seperti pengecekan Banner) -- avatar TIDAK di
      // tengah viewport secara horizontal.
      const avatarCenterX = avatarBox!.x + avatarBox!.width / 2;
      expect(Math.abs(avatarCenterX - viewportWidth / 2)).toBeGreaterThan(60);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Ticket (dua bagian dipisah garis putus-putus) sungguhan tampil di halaman publik", async ({ page }) => {
    // "ticket" dipetakan ke Event (kategori Special, satu-satunya template
    // di kategori itu yang TIDAK jatuh ke default "centered") -- dicek
    // lewat computed style border-style "dashed" pada divider, penanda
    // paling spesifik untuk varian ini (satu-satunya yang punya garis
    // pemisah putus-putus di antara avatar+nama & bio).
    const { username } = await registerAndLogin(page, "quicksetup12");

    await openCategory(page, "Special Purpose");
    await page.getByPlaceholder(/cari template/i).fill("event");
    await page.getByText("Event", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const divider = page.locator("div.border-dashed").first();
      await expect(divider).toBeVisible({ timeout: 3000 });
      const borderStyle = await divider.evaluate((el) => getComputedStyle(el).borderTopStyle);
      expect(borderStyle).toBe("dashed");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  test("varian layout Portrait (foto tegak terkungkung, beda dari Hero yang bleed penuh) sungguhan tampil di halaman publik", async ({
    page,
  }) => {
    // "portrait" dipetakan ke Streamer (kategori Creator) -- sama seperti
    // test Hero, avatar diunggah dulu supaya benar-benar menguji rendering
    // sesungguhnya, bukan fallback "centered"-nya (lihat renderBioHeader,
    // PagePreview.tsx: portrait butuh avatarUrl juga). Beda dari Hero:
    // gambarnya TERKUNGKUNG dalam kolom (w-40=160px, jauh lebih sempit
    // dari viewport) & TIDAK menempel tepi kiri halaman (constrastnya
    // dengan "hero" yang -mx-6 bleed penuh ke tepi bingkai).
    const { username } = await registerAndLogin(page, "quicksetup13");

    await page.goto("/dashboard/design/header");
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: Buffer.from(TEST_IMAGE_PNG_BASE64, "base64") });
    await expect(page.getByText("Mengunggah...")).toHaveCount(0, { timeout: 15000 });

    await openCategory(page, "Creator & Personal Brand");
    await page.getByPlaceholder(/cari template/i).fill("streamer");
    await page.getByText("Streamer", { exact: true }).click();
    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    await expect(async () => {
      await page.goto(`/${username}`);
      const portraitImg = page.locator(`img[alt='${username}']`);
      await expect(portraitImg).toBeVisible({ timeout: 3000 });
      const box = await portraitImg.boundingBox();
      const viewportWidth = page.viewportSize()!.width;
      expect(box).not.toBeNull();
      expect(box!.width).toBeLessThan(200);
      expect(box!.x).toBeGreaterThan(20);
      expect(box!.x + box!.width).toBeLessThan(viewportWidth - 20);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  // Wizard baru (27 Agustus 2026) -- test khusus utk fitur BARU yang tidak
  // ada padanannya sebelum redesain ala alur "Microsite" s.id: tab "Theme"
  // yang bisa mengganti WARNA SAJA tanpa mengubah template (tautan/blok/
  // layout) yang sudah dipilih.
  test("tab Theme mengganti warna tema TANPA mengubah tautan/blok/layout template yang sudah dipilih", async ({ page }) => {
    const { username } = await registerAndLogin(page, "quicksetup14");

    await openCategory(page, "Local Business");
    await page.getByPlaceholder(/cari template/i).fill("cafe");
    await page.getByText("Cafe", { exact: true }).click();

    // Ganti ke tab Theme, pilih tema doodle "Latte" -- SENGAJA beda dari
    // tema bawaan Cafe ("Brew", wallpaper foto cafe) supaya perubahan
    // jelas terlihat/terverifikasi.
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page.getByRole("button", { name: "Doodle", exact: true }).click();
    await page.getByText("Latte", { exact: true }).click();

    // Ringkasan teks tema/layout di bawah pratinjau sudah dihapus
    // (permintaan susulan langsung pengguna) -- bukti "tema berganti,
    // layout & konten Cafe tidak tersentuh" sekarang murni dari hasil
    // akhir sungguhan (tautan Cafe + pola Latte di halaman publik) di
    // bawah, bukan dari teks ringkasan yang sudah tidak ada lagi.

    await page.getByRole("button", { name: "Terapkan Template" }).click();
    await expect(page).toHaveURL(/\/dashboard\/links/, { timeout: 15000 });

    // Tautan/blok Cafe tetap ada apa adanya (bukan diganti jadi kosong
    // atau template lain) -- membuktikan override tema tidak menyentuh
    // konten sama sekali.
    await expect(page.getByText("Ikuti Update Kami", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Lokasi Kami", { exact: true }).first()).toBeVisible();

    // Halaman publik SUNGGUHAN pakai pola doodle Latte (bukan wallpaper
    // Brew bawaan Cafe), sambil bio Cafe ("Ngopi santai di sini") tetap
    // tersimpan -- bukti theme & konten diterapkan dari objek yang sama
    // (previewTemplate) secara konsisten.
    await expect(async () => {
      await page.goto(`/${username}`);
      const html = await page.content();
      expect(html).toContain("/doodles/latte.svg");
      expect(html).toContain("Ngopi santai di sini");
    }).toPass({ timeout: 75000, intervals: [5000] });
  });
});
