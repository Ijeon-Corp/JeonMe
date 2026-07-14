"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, register, setToken } from "@/lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consentAccepted) {
      setError("Kamu harus menyetujui pemrosesan data pribadi untuk mendaftar.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register({ email, username, password, consent_accepted: consentAccepted });
      // Langsung login supaya pengguna tidak perlu isi form dua kali.
      const { token } = await login({ email, password });
      setToken(token);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-subtle/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 shadow-card">
        <h1 className="font-heading text-2xl font-bold text-ink">Buat akun Jeonme</h1>
        <p className="mt-1 text-sm text-muted">Satu link untuk semua yang kamu tawarkan.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">Username</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username-kamu"
              className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-muted">jeonme.com/{username || "username-kamu"}</p>
          </div>
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
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-muted">Minimal 8 karakter.</p>
          </div>

          <label className="flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            Saya menyetujui pemrosesan data pribadi saya oleh Jeonme sesuai kebutuhan layanan
            (sesuai UU PDP).
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Daftar Gratis"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}
