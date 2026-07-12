"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, requestPasswordReset, setToken } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await login({ email, password });
      setToken(token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk, coba lagi.");
    } finally {
      setLoading(false);
    }
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
    <main className="flex min-h-screen items-center justify-center bg-primary-subtle/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-card">
        <h1 className="font-heading text-2xl font-bold text-ink">Masuk ke Jeonme</h1>
        <p className="mt-1 text-sm text-muted">Kelola halaman dan produkmu.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
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
          <form onSubmit={handleResetRequest} className="mt-3 flex flex-col gap-2 rounded-lg bg-primary-subtle p-3">
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

        <p className="mt-6 text-center text-sm text-muted">
          Belum punya akun?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Daftar
          </Link>
        </p>
      </div>
    </main>
  );
}
