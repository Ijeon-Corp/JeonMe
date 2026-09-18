import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./fixtures";

test.describe("Tautan", () => {
  test("menambah tautan lewat UI, muncul di dashboard & halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "links");

    await page.goto("/dashboard/links");
    // Halaman ini TIDAK punya elemen role="heading" sama sekali (judul top
    // bar cuma <p>, bukan <h1>) -- sidebar juga sudah lama di-rename jadi
    // "Link Bio" (konsolidasi sidebar, sebelum sesi ini), jadi "Tautan"
    // tidak pernah cocok apa pun di sini. Pakai teks instruksi unik
    // halaman ini sebagai penanda sudah landing di tempat yang benar.
    await expect(page.getByText("Seret untuk mengubah urutan.")).toBeVisible();

    // Buka modal "Tambah" (CTA utama) lalu pilih tile "Tautan" biasa --
    // role="button" membedakannya dari tautan navigasi sidebar "Tautan"
    // yang role="link".
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Toko Online Saya";
    const linkUrl = "https://example.com/toko";
    await page.getByLabel("Judul").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill(linkUrl);

    // Submit button ada di dalam form yang sama dengan input "Judul tautan"
    // -- dibedakan dari CTA "Tambah" di atasnya yang juga bertuliskan sama.
    const addForm = page.locator("form", { has: page.getByLabel("Judul") });
    await addForm.getByRole("button", { name: "Tambah" }).click();

    // Tautan baru harus muncul di daftar dashboard tanpa perlu reload manual
    // (state lokal diperbarui optimis setelah API sukses). Dibatasi ke
    // getByRole("listitem") -- halaman ini JUGA menampilkan panel pratinjau
    // langsung (LivePreviewPanel) di sebelah kanan yang merender judul yang
    // sama sebagai tautan <a>, getByText polos akan bentrok dengan itu.
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Halaman publik (server component, fetch ISR) -- tunggu sampai jendela
    // cache 60 detik lewat kalau perlu, lalu pastikan tautan benar-benar
    // tampil untuk pengunjung sungguhan, bukan cuma tersimpan di database.
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });

    const publicLink = page.getByRole("link", { name: new RegExp(linkTitle) });
    await expect(publicLink).toHaveAttribute("href", linkUrl);
  });

  test("menonaktifkan tautan membuatnya hilang dari halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "toggle");

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Tautan Nonaktif";
    await page.getByLabel("Judul").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill("https://example.com/nonaktif");
    const addForm = page.locator("form", { has: page.getByLabel("Judul") });
    await addForm.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    // Cari sakelar aktif/nonaktif pada baris tautan yang baru dibuat lalu
    // matikan -- konfirmasi dulu tampil di publik, baru dimatikan, supaya
    // test benar-benar membuktikan transisi (bukan cuma "memang dari awal
    // tidak tampil").
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });

    await page.goto("/dashboard/links");
    const row = page.locator("li", { hasText: linkTitle }).first();
    await row.getByRole("switch").click();

    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText(linkTitle)).toHaveCount(0);
    }).toPass({ timeout: 75000, intervals: [5000] });
  });

  // Ikon Media Sosial di galeri ikon -- permintaan langsung pengguna, 20
  // Agustus 2026: "coba download icon pack gratis untuk mengganti icon
  // icon yang jelek sekarang ini terutama sosmed icon dan tambahkan juga
  // di bagian icon supaya bisa dipilih". Sebelumnya IconPickerModal
  // (lib/icon-library.ts) cuma berisi ikon generik lucide-react -- ikon
  // brand (Instagram dkk, dari Simple Icons lewat components/icons.tsx)
  // sekarang jadi kategori "Media Sosial" tersendiri, bisa dipilih EKSPLISIT
  // lewat galeri, bukan cuma auto-detect dari URL.
  test("ikon brand (Media Sosial) bisa dipilih dari galeri ikon & tersimpan", async ({ page }) => {
    await registerAndLogin(page, "iconpick");

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Kanal Resmi";
    await page.getByLabel("Judul").fill(linkTitle);
    // URL generik SENGAJA (bukan instagram.com/dll) -- membuktikan ikon
    // yang tampil benar-benar dari PILIHAN eksplisit lewat galeri, bukan
    // kebetulan cocok deteksi otomatis detectLinkIcon (lib/link-icons.ts).
    await page.getByPlaceholder("https://...").fill("https://example.com/kanal-resmi");
    const addForm = page.locator("form", { has: page.getByLabel("Judul") });
    await addForm.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    const row = page.locator("li", { hasText: linkTitle }).first();
    // Strip alat kelola (jadwal/kunci/sensitif/ikon/duplikat/hapus) dilipat
    // di balik tombol "Kelola" sejak restrukturisasi UX 31 Agustus 2026 --
    // harus dibuka dulu sebelum ikon aksi per-baris kelihatan.
    await row.getByTitle("Kelola blok (jadwal, kunci, ikon, dll)").click();
    await row.getByTitle("Pilih dari galeri ikon").click();

    await expect(page.getByRole("heading", { name: "Pilih Ikon" })).toBeVisible();
    await expect(page.getByText("Media Sosial", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Instagram", exact: true }).click();

    // Modal tertutup begitu ikon dipilih, tombol galeri di baris tautan ini
    // ikut berubah warna (text-jeon-purple) menandakan ada icon_key tersimpan.
    await expect(page.getByRole("heading", { name: "Pilih Ikon" })).toHaveCount(0);
    await expect(row.getByTitle("Pilih dari galeri ikon")).toHaveClass(/text-jeon-purple/);

    // Reload penuh -- membuktikan pilihannya benar-benar tersimpan ke
    // backend (icon_key), bukan cuma state lokal sesi ini. Strip "Kelola"
    // kembali terlipat sesudah reload (toolsOpenId ikut ter-reset), buka
    // lagi galerinya, opsi "Instagram" harus tampil TERPILIH (border-jeon-purple).
    await page.reload();
    await row.getByTitle("Kelola blok (jadwal, kunci, ikon, dll)").click();
    await expect(row.getByTitle("Pilih dari galeri ikon")).toHaveClass(/text-jeon-purple/);
    await row.getByTitle("Pilih dari galeri ikon").click();
    await expect(page.getByRole("button", { name: "Instagram", exact: true })).toHaveClass(/border-jeon-purple/);
  });

  // Duplikat -- permintaan langsung pengguna, 20 Agustus 2026: "di bagian
  // link bio di blok nya tambahkan fungsi duplicate".
  test("duplikat tautan menyalin judul+URL & muncul sebagai baris kedua", async ({ page }) => {
    await registerAndLogin(page, "duplink");

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Website Saya";
    const linkUrl = "https://example.com/asli";
    await page.getByLabel("Judul").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill(linkUrl);
    await page
      .locator("form", { has: page.getByLabel("Judul") })
      .getByRole("button", { name: "Tambah" })
      .click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    const row = page.locator("li", { hasText: linkTitle }).first();
    // Strip alat kelola dilipat di balik tombol "Kelola" -- lihat catatan
    // lengkap di test "ikon brand" di atas.
    await row.getByTitle("Kelola blok (jadwal, kunci, ikon, dll)").click();
    await row.getByTitle("Duplikat").click();

    // Baris baru muncul dengan judul berakhiran " (Salinan)", URL sama persis.
    const dupTitle = `${linkTitle} (Salinan)`;
    await expect(page.getByRole("listitem").filter({ hasText: dupTitle })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toHaveCount(2);
    const dupRow = page.locator("li", { hasText: dupTitle }).first();
    // Redesain baris blok 18 September 2026 (referensi gambar pengguna):
    // header tautan cuma menampilkan DOMAIN ("example.com"), URL penuh
    // baru tampil setelah baris dibuka lewat tombol "Ubah URL & deskripsi".
    await expect(dupRow.getByText("example.com", { exact: true })).toBeVisible();
    await dupRow.getByTitle("Ubah URL & deskripsi").click();
    await expect(dupRow.getByText(linkUrl, { exact: true })).toBeVisible();
  });

  // Konten Sensitif -- permintaan langsung pengguna, 20 Agustus 2026:
  // "tambahkan juga sensitive content supaya nanti tampil ke user ketika
  // mau akses". Blok "Teks" dipakai sebagai contoh (satu-satunya jenis
  // block_type yang isinya PASTI beda dari judulnya -- membuktikan
  // peringatan MENGGANTIKAN konten asli sepenuhnya, bukan cuma menimpa
  // sebagian tampilan).
  test("blok bertanda konten sensitif tampil sebagai peringatan dulu di halaman publik, baru terlihat setelah diklik", async ({
    page,
  }) => {
    const { username } = await registerAndLogin(page, "sensitif");

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    // Modal v2 (redesain dashboard, dashboard-flags.ts area "page_builder"):
    // tile berkategori, bukan lagi daftar datar -- "Teks" ada di tab
    // "Konten" ("Populer" adalah tab default, tidak berisi "Teks").
    await page.getByRole("button", { name: "Konten", exact: true }).click();
    await page.getByRole("button", { name: "Teks", exact: true }).click();

    const blockTitle = "Info Internal";
    const blockText = "Isi teks yang cuma boleh dilihat setelah klik lanjut.";
    await page.getByLabel("Judul Blok").fill(blockTitle);
    // Isi Teks blok "text" SEKARANG rich-text (TipTap, commit 4399631 "full
    // parity mode Simple vs Builder"), placeholder <textarea> lama "Isi
    // teks yang tampil di halaman publik" sudah tidak ada, ganti
    // contenteditable (pola sama dengan catalog-nested-blocks.spec.ts).
    const contentEditor = page.locator('[contenteditable="true"]');
    await contentEditor.click();
    // toBeFocused() sebelum mengetik -- lihat catatan lengkap di
    // accordion-block.spec.ts (karakter pertama kadang hilang tanpa jeda ini).
    await expect(contentEditor).toBeFocused();
    await page.keyboard.type(blockText);
    await page.getByRole("button", { name: "Buat Blok" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: blockTitle })).toBeVisible({ timeout: 10000 });

    const row = page.locator("li", { hasText: blockTitle }).first();
    // Strip alat kelola dilipat di balik tombol "Kelola" -- lihat catatan
    // lengkap di test "ikon brand" di atas.
    await row.getByTitle("Kelola blok (jadwal, kunci, ikon, dll)").click();
    await row.getByTitle("Tandai konten sensitif").click();
    await expect(row.getByTitle("Batalkan peringatan konten sensitif")).toBeVisible({ timeout: 5000 });

    // Halaman publik: SEBELUM diklik, teks asli TIDAK boleh terlihat sama
    // sekali -- cuma peringatan generik + tombol "Lihat Konten".
    await expect(async () => {
      await page.goto(`/${username}`);
      await expect(page.getByText("Lihat Konten", { exact: true })).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 75000, intervals: [5000] });
    await expect(page.getByText(blockText)).toHaveCount(0);
    // Teks sungguhan berawalan emoji "⚠️ " (lihat SensitiveContentGate,
    // PagePreview.tsx) -- exact:true di sini SEBELUMNYA cocokkan "Konten
    // Sensitif" polos tanpa emoji, tidak pernah match, ditemukan lewat audit
    // 22 Agustus 2026 (bug di TEST ini, bukan di produk -- gate-nya sendiri
    // sudah benar, terbukti dari assertion sebelumnya yang lolos).
    await expect(page.getByText("⚠️ Konten Sensitif", { exact: true })).toBeVisible();

    // Klik "Lihat Konten" -- teks asli baru muncul SESUDAHNYA, murni
    // client-side (tanpa reload/navigasi).
    await page.getByRole("button", { name: "Lihat Konten", exact: true }).click();
    await expect(page.getByText(blockText)).toBeVisible();
  });
});
