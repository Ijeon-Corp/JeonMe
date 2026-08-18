import { test, expect } from "@playwright/test";
import { publishPage, registerAndLogin } from "./fixtures";

test.describe("Tautan", () => {
  test("menambah tautan lewat UI, muncul di dashboard & halaman publik", async ({ page }) => {
    const { username } = await registerAndLogin(page, "links");
    await publishPage(page);

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
    await page.getByPlaceholder("Judul tautan").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill(linkUrl);

    // Submit button ada di dalam form yang sama dengan input "Judul tautan"
    // -- dibedakan dari CTA "Tambah" di atasnya yang juga bertuliskan sama.
    const addForm = page.locator("form", { has: page.getByPlaceholder("Judul tautan") });
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
    await publishPage(page);

    await page.goto("/dashboard/links");
    await page.getByRole("button", { name: "Tambah" }).first().click();
    await page.getByRole("button", { name: "Tautan", exact: true }).click();

    const linkTitle = "Tautan Nonaktif";
    await page.getByPlaceholder("Judul tautan").fill(linkTitle);
    await page.getByPlaceholder("https://...").fill("https://example.com/nonaktif");
    const addForm = page.locator("form", { has: page.getByPlaceholder("Judul tautan") });
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
    await page.getByPlaceholder("Judul tautan").fill(linkTitle);
    // URL generik SENGAJA (bukan instagram.com/dll) -- membuktikan ikon
    // yang tampil benar-benar dari PILIHAN eksplisit lewat galeri, bukan
    // kebetulan cocok deteksi otomatis detectLinkIcon (lib/link-icons.ts).
    await page.getByPlaceholder("https://...").fill("https://example.com/kanal-resmi");
    const addForm = page.locator("form", { has: page.getByPlaceholder("Judul tautan") });
    await addForm.getByRole("button", { name: "Tambah" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: linkTitle })).toBeVisible({ timeout: 10000 });

    const row = page.locator("li", { hasText: linkTitle }).first();
    await row.getByTitle("Pilih dari galeri ikon").click();

    await expect(page.getByRole("heading", { name: "Pilih Ikon" })).toBeVisible();
    await expect(page.getByText("Media Sosial", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Instagram", exact: true }).click();

    // Modal tertutup begitu ikon dipilih, tombol galeri di baris tautan ini
    // ikut berubah warna (text-primary) menandakan ada icon_key tersimpan.
    await expect(page.getByRole("heading", { name: "Pilih Ikon" })).toHaveCount(0);
    await expect(row.getByTitle("Pilih dari galeri ikon")).toHaveClass(/text-primary/);

    // Reload penuh -- membuktikan pilihannya benar-benar tersimpan ke
    // backend (icon_key), bukan cuma state lokal sesi ini. Buka lagi
    // galerinya, opsi "Instagram" harus tampil TERPILIH (border-primary).
    await page.reload();
    await expect(row.getByTitle("Pilih dari galeri ikon")).toHaveClass(/text-primary/);
    await row.getByTitle("Pilih dari galeri ikon").click();
    await expect(page.getByRole("button", { name: "Instagram", exact: true })).toHaveClass(/border-primary/);
  });
});
