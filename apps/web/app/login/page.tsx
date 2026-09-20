"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, consumeSessionExpiredFlag, login, setToken, verifyLogin2FA } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import AuthShell from "@/components/AuthShell";
import GuestGuard from "@/components/GuestGuard";
import AppleAuthButton from "@/components/AppleAuthButton";
import GoogleAuthButton from "@/components/GoogleAuthButton";

function LoginPageInner() {
  const router = useRouter();
  // sessionExpired -- penanda dari api-client saat token ternyata sudah
  // tidak berlaku. Sengaja lewat sessionStorage, bukan query string: begitu
  // token dibersihkan AuthGuard bisa ikut me-replace ke /login polos dan
  // menang balapan navigasi sehingga parameter URL-nya hilang (terbukti
  // saat uji staging). Dibaca di effect supaya render pertama klien tetap
  // identik dengan HTML server, dan dikonsumsi sekali saja.
  const [sessionExpired, setSessionExpired] = useState(false);
  useEffect(() => {
    if (consumeSessionExpiredFlag()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionExpired(true);
    }
  }, []);
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
          {/* aria-label -- tidak ada teks label visual sama sekali di sini
              (cuma placeholder, yang BUKAN pengganti label -- hilang begitu
              diisi & tidak dibaca reliable oleh semua screen reader). */}
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            required
            aria-label="Kode verifikasi 2FA"
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "mfa-error" : undefined}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-center text-lg tracking-[0.3em] text-app-ink focus:border-jeon-purple focus:outline-none"
          />

          {error && <p id="mfa-error" role="alert" className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-jmd btn-primary px-5 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
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

      {sessionExpired && (
        <p role="status" className="mt-4 rounded-jmd bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-800">
          Sesimu sudah berakhir. Silakan masuk lagi.
        </p>
      )}

      {/* id/htmlFor -- audit Lighthouse 17 September 2026 ("Form elements
          do not have associated labels"): <label> di sini SEBELUMNYA cuma
          dekat secara visual, tidak terhubung PROGRAMATIK ke <input>-nya
          (tanpa htmlFor/id, klik label tidak fokus ke input & screen
          reader tidak tahu input ini "Email"/"Password"). */}
      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-app-muted">Email</label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-app-muted">Password</label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="w-full rounded-jmd border-2 border-app-border bg-app-surface px-3.5 py-3 text-sm text-app-ink focus:border-jeon-purple focus:outline-none"
          />
        </div>

        {/* role=alert + id: error diumumkan screen reader saat muncul &
            ditautkan ke kedua field lewat aria-describedby (§22 "form error
            association"). Error di sini bersifat form-level (email/password
            salah), jadi kedua field menunjuk pesan yang sama. */}
        {error && <p id="login-error" role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-jmd btn-primary px-5 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      {/* Google -- permintaan langsung pengguna, 20 Agustus 2026: "pindah
          kan daftar dengan google nya dibagian bawah setelah password" --
          SEBELUMNYA di atas form (di atas divider "atau"), sekarang di
          bawah form email/password. */}
      {/* hasOAuthProvider -- audit UI/UX 20 September 2026: divider "atau"
          SEBELUMNYA tetap dirender apa pun kondisinya walau KEDUA tombol
          soft-fail (comment di bawah sudah sadar soal soft-fail per tombol,
          tapi belum menerapkan hal sama ke divider-nya sendiri) --
          menggantung sendiri tanpa tombol di bawahnya kalau kredensial
          OAuth belum diisi. Sama seperti app/register/page.tsx. */}
      {(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_APPLE_CLIENT_ID) && (
        <>
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
        </>
      )}

      {/* Lupa password -- halaman sendiri sekarang (permintaan langsung
          pengguna, 31 Agustus 2026: "harusnya lupa password itu jadi page
          sendiri"), bukan lagi form kecil muncul-sembunyi di sini -- lihat
          app/forgot-password/page.tsx.
          text-app-ink underline (BUKAN text-jeon-purple) -- audit
          Lighthouse 17 September 2026: teks kecil (text-xs) warna
          jeon-purple di atas bg-app-surface gagal WCAG AA (di bawah 4,5:1).
          jeon-purple-dark yang lebih gelap TIDAK cukup sebagai pengganti --
          halaman ini ikut dark mode global (bg-app-surface/text-app-ink
          FLIP), sementara jeon-purple-dark KONSTAN, jadi kontrasnya
          malah lebih buruk lagi di dark mode. text-app-ink sudah terbukti
          benar di kedua mode di seluruh app -- aksen ungu dipindah ke
          hover saja (garis bawah permanen supaya tetap jelas ini tautan). */}
      <Link href="/forgot-password" className="mt-4 inline-block text-xs font-semibold text-app-ink underline hover:text-jeon-purple">
        Lupa password?
      </Link>

      <p className="mt-8 text-center text-sm text-app-muted">
        Belum punya akun?{" "}
        <Link href="/register" className="font-semibold text-app-ink underline hover:text-jeon-purple">
          Daftar
        </Link>
      </p>
    </AuthShell>
  );
}

// Bungkus GuestGuard (lihat components/GuestGuard.tsx): pengguna yang sudah
// punya sesi diarahkan ke tujuan pasca-login, tidak lagi melihat form ini.
export default function LoginPage() {
  return (
    <GuestGuard>
      <LoginPageInner />
    </GuestGuard>
  );
}
