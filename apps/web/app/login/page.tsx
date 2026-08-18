"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, requestPasswordReset, setToken, verifyLogin2FA } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import AuthShell from "@/components/AuthShell";
import GoogleAuthButton from "@/components/GoogleAuthButton";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

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
        <h1 className="font-heading text-3xl font-extrabold text-ink">Verifikasi 2FA</h1>
        <p className="mt-3 text-sm text-muted">Masukkan kode dari aplikasi authenticator-mu.</p>

        <form onSubmit={handleVerifyMfa} className="mt-8 flex flex-col gap-4">
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            required
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-center text-lg tracking-[0.3em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
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
            className="text-xs font-semibold text-muted hover:text-primary"
          >
            Kembali ke login
          </button>
        </form>
      </AuthShell>
    );
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setResetMessage(null);
    try {
      const res = await requestPasswordReset(resetEmail);
      setResetMessage(
        res.dev_reset_token
          ? `${res.message} (mode dev, token: ${res.dev_reset_token})`
          : res.message
      );
    } catch {
      setResetMessage("Gagal mengirim tautan reset, coba lagi.");
    }
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold leading-tight text-ink sm:text-4xl" style={{ textWrap: "balance" }}>
        Masuk ke Jeon.id
      </h1>
      <p className="mt-3 text-sm text-muted">Kelola halaman dan produkmu.</p>

      <div className="mt-8">
        <GoogleAuthButton label="Masuk dengan Google" />
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">atau</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setShowReset((v) => !v)}
        className="mt-4 text-xs font-semibold text-primary hover:underline"
      >
        Lupa password?
      </button>

      {showReset && (
        <form onSubmit={handleResetRequest} className="mt-3 flex flex-col gap-2 rounded-xl bg-primary-subtle p-3">
          <input
            type="email"
            required
            placeholder="Email akunmu"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">
            Kirim tautan reset
          </button>
          {resetMessage && <p className="text-xs text-ink">{resetMessage}</p>}
        </form>
      )}

      <p className="mt-8 text-center text-sm text-muted">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}
