"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, login, register, setToken } from "@/lib/api-client";
import AuthShell from "@/components/AuthShell";

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
      // Langsung login supaya pengguna tidak perlu isi form dua kali. Akun
      // yang baru saja dibuat tidak mungkin sudah punya 2FA aktif (Modul
      // Settings §5), jadi token selalu langsung ada di sini.
      const res = await login({ email, password });
      setToken(res.token!);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mendaftar, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold leading-tight text-ink sm:text-4xl" style={{ textWrap: "balance" }}>
        Daftar ke Jeonme
      </h1>
      <p className="mt-3 text-sm text-muted">
        Buat halaman bio, jualan produk digital, & terima dukungan dari satu link -- <span className="font-semibold text-ink">gratis</span>.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Klaim link bio gratismu</label>
          {/* Prefiks "jeonme.com/" MENYATU dengan input (referensi layout
              signup Beacons) -- lebih jelas ini adalah alamat, bukan cuma
              teks bantuan terpisah di bawah field seperti sebelumnya. */}
          <div className="flex items-center rounded-xl border border-border bg-white pl-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="flex-shrink-0 text-sm font-semibold text-muted">jeonme.com/</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username-kamu"
              className="w-full min-w-0 bg-transparent py-3 pl-0.5 pr-3.5 text-sm text-ink focus:outline-none"
            />
          </div>
        </div>
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-xs text-muted">Minimal 8 karakter.</p>
        </div>

        <label className="flex items-start gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0"
          />
          Saya menyetujui pemrosesan data pribadi saya oleh Jeonme sesuai kebutuhan layanan
          (sesuai UU PDP).
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Daftar Gratis"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted">
        Sudah punya akun?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
