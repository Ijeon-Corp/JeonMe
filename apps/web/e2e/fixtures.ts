import crypto from "crypto";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { Page, expect } from "@playwright/test";

// Helper bersama untuk seluruh test E2E -- membuat akun kreator uji BARU
// dan SUNGGUHAN (register lewat UI, bukan lewat API langsung) supaya test
// juga memvalidasi form register itu sendiri sekaligus, lalu dipakai ulang
// oleh spec lain yang butuh sesi sudah login. Username diberi awalan "e2e"
// + timestamp supaya tidak pernah bentrok antar-run & mudah dikenali/
// dibersihkan dari database kalau ada sisa.
export function uniqueUsername(prefix: string): string {
  return `e2e${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

// Baca satu key dari apps/api/.env (config lokal SUNGGUHAN yang dipakai API
// yang sedang jalan, bukan disalin ulang ke sini -- supaya tidak pernah
// beda dengan apa yang API benar-benar pakai, dan supaya secret seperti
// MIDTRANS_SERVER_KEY tidak pernah tertulis literal di file test yang
// masuk git). apps/api/.env sendiri gitignored.
function readApiEnvValue(key: string): string {
  const envPath = path.join(__dirname, "..", "..", "api", ".env");
  const content = fs.readFileSync(envPath, "utf-8");
  const line = content.split("\n").find((l) => l.trim().startsWith(`${key}=`));
  if (!line) throw new Error(`readApiEnvValue: ${key} tidak ditemukan di apps/api/.env`);
  return line.slice(line.indexOf("=") + 1).trim();
}

// Percepatan KHUSUS lokal, bukan trik yang aman/berlaku di staging maupun
// production: suite E2E ini berjalan sekuensial (workers:1, lihat
// playwright.config.ts) tapi endpoint register+login berbagi SATU bucket
// rate-limit (10 req/menit per IP, middleware.RateLimit di routes.go) --
// makin banyak spec file makin sering nabrak batas itu, dan menunggu
// jendela 1 menit penuh tiap kali akan membuat suite penuh sangat lambat.
// Karena Redis di sini instance lokal MILIK SESI TEST INI SENDIRI (bukan
// staging/production yang dibagi orang lain), aman menghapus langsung key
// rate-limit punya IP loopback lewat redis-cli alih-alih menunggu.
// Best-effort dengan sengaja: kalau redis-cli tidak ada di PATH (lingkungan
// tanpa akses shell ke Redis lokal), diam-diam gagal -- caller tetap punya
// waitForTimeout sebagai fallback.
export function resetLocalAuthRateLimit(): void {
  try {
    const redisUrl = readApiEnvValue("REDIS_URL");
    const port = redisUrl.match(/:(\d+)\//)?.[1] ?? "6379";
    const scan = execFileSync("redis-cli", ["-p", port, "--scan", "--pattern", "ratelimit:auth:*"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const keys = scan.split("\n").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      execFileSync("redis-cli", ["-p", port, "DEL", ...keys], { timeout: 5000 });
    }
  } catch {
    // best-effort, lihat komentar di atas.
  }
}

// Endpoint auth dibatasi 10 req/menit per IP (middleware.RateLimit, lihat
// routes.go) -- rangkaian test yang register berkali-kali dengan cepat bisa
// melewati ambang itu (ditemukan langsung lewat kegagalan run pertama).
// Retry dengan jeda begitu pesan "terlalu banyak permintaan" muncul, bukan
// melewatinya -- pola yang sama dipakai sepanjang sesi ini saat verifikasi
// manual lewat curl.
//
// Bug ditemukan (8 Agustus 2026, run penuh suite setelah menambah banyak
// spec baru): register+login berbagi SATU bucket rate-limit -- kadang
// register sendiri sukses (201) tapi panggilan login OTOMATIS setelahnya
// (bagian dari alur form register yang sama) kena 429 duluan. Versi lama
// fungsi ini memakai SATU username yang sama di semua percobaan retry,
// jadi percobaan berikutnya coba register lagi dengan username yang
// TERNYATA sudah berhasil dibuat -> 409 Conflict, bukan "terlalu banyak
// permintaan" ATAUPUN redirect sukses -- race di bawah tidak mengenali
// keduanya, langsung dianggap "timeout" berulang sampai percobaan habis.
// Fix: username/email baru di SETIAP percobaan (akun yang gagal login itu
// ditinggal begitu saja, tidak masalah -- akun uji memang tidak dibersihkan
// otomatis, lihat e2e/README.md) supaya register percobaan berikutnya
// tidak pernah bentrok dengan sisa percobaan sebelumnya.
export async function registerAndLogin(page: Page, usernamePrefix: string): Promise<{ username: string; email: string }> {
  const password = "Password123!";
  // Reset SEBELUM percobaan pertama juga -- suite lengkap (banyak spec
  // file, tiap file register beberapa akun) bisa saja sudah menghabiskan
  // bucket dari test SEBELUMNYA tepat sebelum test ini mulai.
  resetLocalAuthRateLimit();

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = uniqueUsername(usernamePrefix);
    const email = `${username}@example.com`;

    await page.goto("/register");
    await page.locator('input[placeholder="username-kamu"]').fill(username);
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: "Daftar Gratis" }).click();

    const rateLimited = page.getByText("terlalu banyak permintaan");
    const result = await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 15000 }).then(() => "ok" as const),
      rateLimited.waitFor({ timeout: 15000 }).then(() => "rate-limited" as const),
    ]).catch(() => "timeout" as const);

    if (result === "ok") return { username, email };
    // "timeout" (bukan cuma "rate-limited" eksplisit) JUGA berarti retry --
    // kasus di atas (register sukses, login-otomatis 429) tidak pernah
    // memunculkan toast "terlalu banyak permintaan" sama sekali, tapi tetap
    // berarti bucket rate-limit sedang penuh. Coba bersihkan bucket lokal
    // dulu (instan) sebelum jatuh ke waitForTimeout penuh sebagai fallback.
    resetLocalAuthRateLimit();
    await page.waitForTimeout(1000);
  }
  throw new Error("registerAndLogin: tetap gagal masuk /dashboard setelah beberapa kali percobaan (rate limit atau error lain)");
}

// pages.is_published DEFAULT false (migrations/000001_init_schema.up.sql) --
// akun baru daftar TIDAK otomatis tampil di halaman publik. Test yang
// memeriksa halaman publik harus menerbitkannya dulu lewat sakelar
// "Terbitkan halaman publik" di /dashboard/design (ditemukan lewat run
// pertama test ini sendiri: tautan sudah dibuat & benar tersimpan tapi
// halaman publik tidak pernah menampilkannya, apa pun lamanya ditunggu).
// Login ke akun yang SUDAH terdaftar lewat registerAndLogin (password selalu
// "Password123!", lihat di atas) -- dipakai test yang butuh sesi KEDUA untuk
// akun yang sama (mis. menguji revoke sesi lain), bukan mendaftarkan akun
// baru lagi.
// Bug ditemukan (8 Agustus 2026, suite penuh setelah menambah banyak spec
// baru): fungsi ini SEBELUMNYA tidak punya retry/reset rate-limit sama
// sekali (beda dari registerAndLogin) -- test yang butuh SESI KEDUA gagal
// diam-diam kalau bucket auth (dibagi register+login, lihat catatan
// panjang di registerAndLogin di atas) sudah penuh dari test-test
// sebelumnya di suite yang sama.
export async function loginAs(page: Page, email: string): Promise<void> {
  resetLocalAuthRateLimit();
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("Password123!");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();

    const rateLimited = page.getByText("terlalu banyak permintaan");
    const result = await Promise.race([
      page.waitForURL("**/dashboard", { timeout: 15000 }).then(() => "ok" as const),
      rateLimited.waitFor({ timeout: 15000 }).then(() => "rate-limited" as const),
    ]).catch(() => "timeout" as const);

    if (result === "ok") return;
    resetLocalAuthRateLimit();
    await page.waitForTimeout(1000);
  }
  throw new Error("loginAs: tetap gagal masuk /dashboard setelah beberapa kali percobaan (rate limit atau error lain)");
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Implementasi TOTP (RFC 6238) manual -- SENGAJA tanpa dependency npm baru
// (mis. otplib) hanya untuk kebutuhan satu test ini, konsisten dengan gaya
// proyek ini (hand-roll daripada tambah library untuk kebutuhan kecil).
// Harus SAMA PERSIS dengan default pquerna/otp di backend: SHA1, 30 detik,
// 6 digit (lihat SecurityHandler.Enable2FA).
export function generateTotpCode(secret: string, at: Date = new Date()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(at.getTime() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, "0");
}

export async function publishPage(page: Page): Promise<void> {
  await page.goto("/dashboard/design");
  const toggle = page.getByRole("switch", { name: "Terbitkan halaman publik" });
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  }
}

// Jalankan SQL langsung ke Postgres lokal lewat psql (bukan lib pg -- tidak
// ada dependency database di package.json apps/web, dan menambah satu cuma
// untuk kebutuhan test kecil ini bertentangan dengan gaya proyek, lihat
// alasan sama di generateTotpCode di atas). Dipakai HANYA untuk seed state
// yang tidak punya jalur UI resmi (role admin, langganan Premium aktif) --
// bukan pengganti alur UI untuk apa pun yang BISA diuji lewat UI.
export function runSql(sql: string): string {
  const databaseUrl = readApiEnvValue("DATABASE_URL");
  return execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf-8",
  });
}

// Promosi ke admin TIDAK punya alur UI (akun admin pertama selalu dibuat
// manual di database sungguhan, lihat middleware.go role="admin" dicek
// langsung dari DB) -- test panel admin harus mem-bootstrap lewat SQL
// langsung, sama seperti operator sungguhan melakukannya.
export function promoteToAdmin(username: string): void {
  runSql(`UPDATE users SET role = 'admin' WHERE username = '${username}';`);
}

// Langganan Premium SUNGGUHAN hanya bisa diaktifkan lewat pembayaran kartu
// tersimpan Midtrans (redirect penuh ke halaman Snap ter-hosting, lihat
// app/dashboard/settings/subscription/page.tsx) -- tidak bisa diselesaikan
// murni lewat browser di E2E tanpa kartu sungguhan. Test gating Premium
// (watermark, latar kustom) menyuntik baris `subscriptions` aktif langsung,
// meniru SIS AKHIR yang dihasilkan webhook Midtrans setelah pembayaran
// sukses (lihat isPremiumUser di subscription.go: status='active' cukup).
export function grantPremium(username: string, plan: "monthly" | "yearly" = "monthly"): void {
  runSql(`
    INSERT INTO subscriptions (user_id, plan, amount_idr, status, enrollment_order_id, current_period_end)
    VALUES ((SELECT id FROM users WHERE username = '${username}'), '${plan}', 49000, 'active', 'e2e-seed-${crypto.randomUUID()}', now() + interval '30 days');
  `);
}

// Signature Midtrans: SHA512(order_id + status_code + gross_amount +
// server_key) -- rumus resmi Midtrans, harus SAMA PERSIS dengan
// midtrans.Sign di backend (internal/midtrans/client.go) supaya
// VerifySignature menerimanya.
function signMidtransWebhook(orderID: string, statusCode: string, grossAmount: string, serverKey: string): string {
  return crypto.createHash("sha512").update(orderID + statusCode + grossAmount + serverKey).digest("hex");
}

// Melunasi order lewat webhook Midtrans SINTETIS yang ditandatangani benar
// -- teknik yang SAMA dipakai test Go backend sendiri (checkout_test.go),
// bukan jalan pintas di luar kontrak API. Diperlukan karena pembelian
// sungguhan berakhir di halaman Snap ter-hosting Midtrans (di luar
// localhost) yang notifikasi webhook-nya balik ke API TIDAK bisa dijangkau
// dari sandbox lokal tanpa tunnel publik (ngrok dkk) -- lihat riset alur
// checkout sebelum test ini ditulis. orderID di sini WAJIB berupa order_id
// (UUID) yang dikembalikan endpoint POST /checkout, BUKAN psp_reference --
// fungsi ini yang menambahkan awalan "jeonme-order-" (lihat checkout.go).
export async function payOrderViaWebhook(orderID: string, grossAmountIDR: number): Promise<void> {
  const serverKey = readApiEnvValue("MIDTRANS_SERVER_KEY");
  const externalID = `jeonme-order-${orderID}`;
  const statusCode = "200";
  const grossAmount = grossAmountIDR.toFixed(2);
  const payload = {
    order_id: externalID,
    status_code: statusCode,
    gross_amount: grossAmount,
    transaction_status: "settlement",
    transaction_id: crypto.randomUUID(),
    fraud_status: "accept",
    payment_type: "qris",
    signature_key: signMidtransWebhook(externalID, statusCode, grossAmount, serverKey),
  };

  const apiBase = (process.env.E2E_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/api\/v1$/, "");
  const res = await fetch(`${apiBase}/api/v1/webhooks/midtrans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`payOrderViaWebhook: webhook membalas ${res.status}: ${await res.text()}`);
  }
}
