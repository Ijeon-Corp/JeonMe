import crypto from "crypto";
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

// Endpoint auth dibatasi 10 req/menit per IP (middleware.RateLimit, lihat
// routes.go) -- rangkaian test yang register berkali-kali dengan cepat bisa
// melewati ambang itu (ditemukan langsung lewat kegagalan run pertama).
// Retry dengan jeda begitu pesan "terlalu banyak permintaan" muncul, bukan
// melewatinya -- pola yang sama dipakai sepanjang sesi ini saat verifikasi
// manual lewat curl.
export async function registerAndLogin(page: Page, usernamePrefix: string): Promise<{ username: string; email: string }> {
  const username = uniqueUsername(usernamePrefix);
  const email = `${username}@example.com`;
  const password = "Password123!";

  for (let attempt = 0; attempt < 6; attempt++) {
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
    if (result === "rate-limited") {
      await page.waitForTimeout(15000);
      continue;
    }
    throw new Error(`registerAndLogin: navigasi ke /dashboard tidak terjadi dan tidak ada pesan rate-limit (percobaan ${attempt + 1})`);
  }
  throw new Error("registerAndLogin: tetap kena rate limit setelah beberapa kali percobaan");
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
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill("Password123!");
  await page.getByRole("button", { name: "Masuk" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15000 });
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
