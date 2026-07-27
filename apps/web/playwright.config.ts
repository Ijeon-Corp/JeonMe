import { defineConfig, devices } from "@playwright/test";

// Setup E2E pertama untuk Jeonme (permintaan langsung pengguna, 27 Juli
// 2026): "saya mau lakukan e2e testing menggunakan playwright". Dijalankan
// terhadap server dev yang SUDAH berjalan (npm run dev di port 3000 + API
// Go di port 8080) -- BUKAN terhadap staging/production, supaya test dapat
// membuat/menghapus akun kreator uji sungguhan tanpa menyentuh data nyata.
// webServer TIDAK dikonfigurasi start otomatis di sini karena API Go (di
// luar workspace npm ini) juga harus sudah berjalan -- lihat catatan di
// e2e/README.md untuk cara menjalankan.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // setiap test daftar akun uji sendiri -- hindari beban rate-limit auth bersamaan
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Default 30s TERLALU PENDEK -- beberapa test menunggu jendela cache ISR
  // Next.js (60s, lihat next: { revalidate: 60 } di app/[username]/page.tsx)
  // lewat sebelum halaman publik menampilkan perubahan terbaru.
  timeout: 120_000,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
