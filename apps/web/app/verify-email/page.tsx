"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, confirmSignupVerification, resendSignupVerification, setToken } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import AuthShell from "@/components/AuthShell";

const DEV_CODE_STORAGE_KEY = "jeon_dev_verification_code";

type InitialParams = { email: string; devCode: string };

// resolveInitialParams -- fungsi pengambil-data MURNI (return hasil, TANPA
// setState), dipisah dari komponennya sendiri, dirangkai lewat
// .then(applyResult) di badan efek -- pola resmi proyek ini
// (react-hooks/set-state-in-effect, lihat CLAUDE.md), sama seperti
// app/auth/google/callback/page.tsx. window.location.search & sessionStorage
// SENGAJA dibaca lewat window langsung (bukan useSearchParams()) supaya
// halaman ini tidak perlu dibungkus <Suspense>, alasan sama persis dengan
// callback Google itu.
async function resolveInitialParams(): Promise<InitialParams> {
  const email = new URLSearchParams(window.location.search).get("email") ?? "";
  const devCode = sessionStorage.getItem(DEV_CODE_STORAGE_KEY) ?? "";
  if (devCode) sessionStorage.removeItem(DEV_CODE_STORAGE_KEY);
  return { email, devCode };
}

// /verify-email -- permintaan langsung pengguna, 19 Agustus 2026: "saat
// sign up butuh kode verif yang dikirim dari email untuk aktivasi baru
// setelah itu akun bisa digunakan". Dituju dari 2 tempat: langsung setelah
// /register (akun baru SELALU butuh ini sekarang), dan dari /login kalau
// akun yang mencoba masuk ternyata belum diverifikasi (lihat
// ApiError.body.email_verification_required, api-client.ts).
export default function VerifyEmailPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [devHint, setDevHint] = useState<string | null>(null);

  useEffect(() => {
    resolveInitialParams().then((result) => {
      setEmail(result.email);
      if (result.devCode) {
        setCode(result.devCode);
        setDevHint(`Mode dev (SMTP belum dikonfigurasi): kode sudah diisi otomatis (${result.devCode}).`);
      }
    });
  }, []);

  // Hitung mundur cooldown kirim ulang -- interval dibersihkan sendiri
  // begitu mencapai 0 atau komponen unmount.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await confirmSignupVerification({ email, code: code.trim() });
      setToken(res.token);
      await redirectAfterAuth(router);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memverifikasi, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setDevHint(null);
    setResending(true);
    try {
      const res = await resendSignupVerification({ email });
      if (res.dev_verification_code) {
        setCode(res.dev_verification_code);
        setDevHint(`Mode dev (SMTP belum dikonfigurasi): kode baru sudah diisi otomatis (${res.dev_verification_code}).`);
      }
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengirim ulang kode, coba lagi.");
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold leading-tight text-ink sm:text-4xl" style={{ textWrap: "balance" }}>
        Verifikasi Emailmu
      </h1>
      <p className="mt-3 text-sm text-muted">
        Kami sudah mengirim kode 6 digit ke{" "}
        <span className="font-semibold text-ink">{email || "emailmu"}</span>. Masukkan kodenya untuk mengaktifkan akun --
        akunmu belum bisa dipakai sebelum ini.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted">Kode Verifikasi</label>
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            required
            maxLength={6}
            pattern="[0-9]{6}"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="w-full rounded-xl border border-border px-3.5 py-3 text-center text-lg font-bold tracking-[0.4em] text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="mt-1 text-xs text-muted">Kode berlaku 15 menit sejak diminta.</p>
        </div>

        {devHint && <p className="rounded-lg bg-accent-subtle px-3 py-2 text-xs text-accent-dark">{devHint}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="mt-2 rounded-full bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-card transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memverifikasi..." : "Verifikasi & Masuk"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Tidak dapat kodenya?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendCooldown > 0}
          className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
        >
          {resendCooldown > 0 ? `Kirim ulang (${resendCooldown}d)` : resending ? "Mengirim..." : "Kirim ulang kode"}
        </button>
      </p>

      <p className="mt-4 text-center text-sm text-muted">
        Salah email?{" "}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Daftar ulang
        </Link>
      </p>
    </AuthShell>
  );
}
