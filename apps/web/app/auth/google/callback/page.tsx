"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, googleLogin, setToken } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import { consumeGoogleOAuthState, googleRedirectUri } from "@/lib/google-oauth";
import AuthShell from "@/components/AuthShell";

type CallbackResult = { ok: true; token: string } | { ok: false; message: string };

// resolveCallback -- fungsi pengambil-data MURNI (return hasil, TANPA
// setState) dipisah dari komponennya sendiri supaya SEMUA jalur (error dari
// Google, state CSRF tidak cocok, exchange gagal, ATAUPUN sukses) mengalir
// lewat SATU .then(applyResult) yang dirangkai pada promise yang direturn
// efek -- pola resmi proyek ini (react-hooks/set-state-in-effect, lihat
// CLAUDE.md) untuk menghindari setState SINKRON langsung di badan efek.
async function resolveCallback(searchParams: URLSearchParams): Promise<CallbackResult> {
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return {
      ok: false,
      message: oauthError === "access_denied" ? "Kamu membatalkan proses masuk dengan Google." : "Google mengembalikan error, coba lagi.",
    };
  }

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const expectedState = consumeGoogleOAuthState();
  if (!code || !returnedState || returnedState !== expectedState) {
    return { ok: false, message: "Sesi login Google tidak valid atau kedaluwarsa, coba lagi dari awal." };
  }

  try {
    const res = await googleLogin({ code, redirect_uri: googleRedirectUri() });
    return { ok: true, token: res.token };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Gagal masuk dengan Google, coba lagi." };
  }
}

// /auth/google/callback -- URI ini didaftarkan PERSIS sebagai Authorized
// redirect URI di Google Cloud Console (alur Authorization Code penuh,
// permintaan langsung pengguna 13 Agustus 2026: "tambahkan di login dan
// register login via google"). Google mengarahkan browser ke sini bawa
// ?code=... setelah pengguna menyetujui di layar consent, baik proses itu
// dimulai dari tombol di /login MAUPUN /register (satu callback melayani
// keduanya, backend juga satu endpoint yang sama -- lihat
// AuthHandler.GoogleLogin & GoogleAuthButton.tsx).
//
// Sengaja baca query string lewat window.location.search (bukan
// useSearchParams()) -- halaman ini murni client-side redirect target,
// tidak ada nilai SEO/SSR sama sekali, dan ini menghindari kebutuhan
// membungkusnya dengan <Suspense> yang wajib dipakai useSearchParams()
// kalau segmen ini di-static-generate.
export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resolveCallback(new URLSearchParams(window.location.search)).then((result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setToken(result.token);
      redirectAfterAuth(router);
    });
  }, [router]);

  return (
    <AuthShell>
      <h1 className="font-heading text-3xl font-extrabold text-ink">Menghubungkan ke Google...</h1>
      {error ? (
        <>
          <p className="mt-3 text-sm text-red-600">{error}</p>
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
            Kembali ke login
          </Link>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">Tunggu sebentar, kami sedang memverifikasi akunmu.</p>
      )}
    </AuthShell>
  );
}
