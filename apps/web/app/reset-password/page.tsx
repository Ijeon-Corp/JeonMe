"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, confirmPasswordReset } from "@/lib/api-client";
import AuthShell from "@/components/AuthShell";

// resolveInitialToken -- fungsi pengambil-data MURNI (return hasil, TANPA
// setState), pola sama seperti resolveInitialParams di app/verify-email/page.tsx
// (react-hooks/set-state-in-effect, lihat CLAUDE.md) -- window.location.search
// dibaca langsung (bukan useSearchParams()) supaya halaman ini tidak perlu
// dibungkus <Suspense>.
async function resolveInitialToken(): Promise<string> {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

// /reset-password -- perbaikan 20 Agustus 2026, ditemukan lewat audit
// "apakah notifikasi sudah berfungsi semua": RequestPasswordReset SELAMA
// INI cuma menyimpan token ke DB tanpa pernah benar-benar mengirim email
// (lihat catatan lengkap di queue.TypePasswordResetEmail, apps/api), DAN
// halaman ini SENDIRI belum pernah ada -- confirmPasswordReset (api-client.ts)
// sudah lama diekspor tapi tidak pernah dipanggil dari mana pun. Dituju
// dari tautan di email reset password (?token=...) yang sekarang benar-benar
// dikirim worker.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    resolveInitialToken().then(setToken);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await confirmPasswordReset({ token, new_password: newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mereset password, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center py-6 text-center">
          <span className="success-pop-circle flex h-16 w-16 items-center justify-center rounded-full bg-secondary-subtle text-secondary-dark">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
              <path
                d="M5 12.5 9.5 17 19 7"
                pathLength={1}
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="success-pop-check"
              />
            </svg>
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold text-ink sm:text-3xl">Password Berhasil Diganti!</h1>
          <p className="mt-2 text-sm text-muted">Masuk lagi pakai password barumu.</p>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="mt-7 w-full rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5"
          >
            Ke Halaman Masuk
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold leading-tight text-ink sm:text-4xl" style={{ textWrap: "balance" }}>
        Buat Password Baru
      </h1>
      <p className="mt-3 text-sm text-muted">Masukkan password baru untuk akunmu. Tautan ini berlaku 1 jam sejak diminta.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Password Baru</label>
          <input
            type="password"
            autoFocus
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
            className="w-full rounded-xl border border-border px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !token || newPassword.length < 8}
          className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Menyimpan..." : "Reset Password"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Kembali ke{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          halaman masuk
        </Link>
      </p>
    </AuthShell>
  );
}
