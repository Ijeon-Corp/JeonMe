"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/api-client";
import AuthShell from "@/components/AuthShell";

// /forgot-password -- permintaan langsung pengguna, 31 Agustus 2026:
// "harusnya lupa password itu jadi page sendiri". SEBELUMNYA alur minta
// tautan reset cuma form kecil yang muncul-sembunyi di dalam /login
// (toggle "Lupa password?") -- sekarang halaman sendiri dengan AuthShell
// yang sama, konsisten dengan alur /reset-password (halaman yang dituju
// tautan di email-nya). LOGIKA persis pindahan dari login/page.tsx
// (requestPasswordReset + tampilkan dev_reset_token di mode dev), tidak
// ada perilaku baru.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      setMessage(res.dev_reset_token ? `${res.message} (mode dev, token: ${res.dev_reset_token})` : res.message);
    } catch {
      setMessage("Gagal mengirim tautan reset, coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-app-ink sm:text-5xl" style={{ textWrap: "balance" }}>
        Lupa password?
      </h1>
      <p className="mt-3 text-sm text-app-muted">
        Masukkan email akunmu -- kami kirimkan tautan untuk membuat password baru. Tautan berlaku 1 jam.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          {/* id/htmlFor -- audit Lighthouse 17 September 2026, lihat
              catatan lengkap di app/login/page.tsx. */}
          <label htmlFor="forgot-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-app-muted">Email</label>
          <input
            id="forgot-email"
            type="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={message ? "forgot-message" : undefined}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>

        {/* role=status (bukan alert): pesan ini bisa sukses ATAU gagal, jadi
            live-region sopan (§22 form error association / status). */}
        {/* break-all -- audit UI/UX 20 September 2026: dev_reset_token (hex
            ~64 karakter, satu "kata" tanpa spasi, cuma tampil saat SMTP
            belum dikonfigurasi/dev-staging) memaksa seluruh halaman
            melebar horizontal parah di mobile tanpa ini. */}
        {message && <p id="forgot-message" role="status" className="break-all rounded-jmd bg-jeon-lavender/30 px-3.5 py-2.5 text-sm text-app-ink">{message}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-jmd btn-primary px-5 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Mengirim..." : "Kirim Tautan Reset"}
        </button>
      </form>

      {/* text-app-ink underline (BUKAN text-jeon-purple) -- kontras teks
          kecil, lihat catatan lengkap di app/login/page.tsx. */}
      <p className="mt-8 text-center text-sm text-app-muted">
        Ingat password-mu?{" "}
        <Link href="/login" className="font-semibold text-app-ink underline hover:text-jeon-purple">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}
