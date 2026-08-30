"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, setToken, verifyLogin2FA } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import AuthShell from "@/components/AuthShell";
import AppleAuthButton from "@/components/AppleAuthButton";
import GoogleAuthButton from "@/components/GoogleAuthButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Modul Settings §5: kalau akun ber-2FA, login() TIDAK langsung memberi
  // token -- mfaToken menandai kita sedang menunggu kode dari aplikasi
  // authenticator sebelum token sungguhan diterbitkan (lihat
  // AuthHandler.VerifyLogin2FA).
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login({ email, password });
      if (res.mfa_required && res.mfa_token) {
        setMfaToken(res.mfa_token);
        return;
      }
      setToken(res.token!);
      await redirectAfterAuth(router);
    } catch (err) {
      // email_verification_required -- permintaan langsung pengguna, 19
      // Agustus 2026: akun yang belum memasukkan kode dari email ditolak
      // /auth/login dengan flag ini (lihat catatan lengkap di
      // ApiError.body, api-client.ts). Arahkan LANGSUNG ke halaman
      // verifikasi (bukan cuma menampilkan pesan error generik) supaya
      // pengguna tidak bingung harus ke mana.
      if (err instanceof ApiError && err.body.email_verification_required) {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Gagal masuk, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setLoading(true);
    try {
      const { token } = await verifyLogin2FA({ mfa_token: mfaToken, code: mfaCode });
      setToken(token);
      await redirectAfterAuth(router);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kode 2FA salah, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (mfaToken) {
    return (
      <AuthShell>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-app-ink">Verifikasi 2FA</h1>
        <p className="mt-3 text-sm text-app-muted">Masukkan kode dari aplikasi authenticator-mu.</p>

        <form onSubmit={handleVerifyMfa} className="mt-8 flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            required
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-center text-lg tracking-[0.3em] text-app-ink focus:border-jeon-purple focus:outline-none"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-jmd bg-jeon-purple px-5 py-3.5 text-sm font-bold text-white shadow-jsoft transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          >
            {loading ? "Memverifikasi..." : "Verifikasi"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMfaToken(null);
              setMfaCode("");
              setError(null);
            }}
            className="text-xs font-semibold text-app-muted hover:text-jeon-purple"
          >
            Kembali ke login
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight text-app-ink sm:text-5xl" style={{ textWrap: "balance" }}>
        Masuk ke jeon.id
      </h1>
      <p className="mt-3 text-sm text-app-muted">Kelola halaman dan produkmu.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-app-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-app-muted">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-jmd bg-jeon-purple px-5 py-3.5 text-sm font-bold text-white shadow-jsoft transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      {/* Google -- permintaan langsung pengguna, 20 Agustus 2026: "pindah
          kan daftar dengan google nya dibagian bawah setelah password" --
          SEBELUMNYA di atas form (di atas divider "atau"), sekarang di
          bawah form email/password. */}
      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-app-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-app-muted">atau</span>
        <div className="h-px flex-1 bg-app-border" />
      </div>
      {/* AppleAuthButton -- permintaan langsung pengguna, 20 Agustus 2026:
          "tambahkan juga login via apple". Kedua tombol soft-fail sendiri-
          sendiri (tidak dirender kalau kredensial masing-masing belum
          diisi), jadi urutan/keberadaan salah satu tidak bergantung yang
          lain -- flex-col gap-2.5 supaya rapi kalau cuma satu yang tampil
          MAUPUN keduanya. */}
      <div className="flex flex-col gap-2.5">
        <GoogleAuthButton label="Masuk dengan Google" />
        <AppleAuthButton label="Masuk dengan Apple" />
      </div>

      {/* Lupa password -- halaman sendiri sekarang (permintaan langsung
          pengguna, 31 Agustus 2026: "harusnya lupa password itu jadi page
          sendiri"), bukan lagi form kecil muncul-sembunyi di sini -- lihat
          app/forgot-password/page.tsx. */}
      <Link href="/forgot-password" className="mt-4 inline-block text-xs font-semibold text-jeon-purple hover:underline">
        Lupa password?
      </Link>

      <p className="mt-8 text-center text-sm text-app-muted">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-jeon-purple hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}
