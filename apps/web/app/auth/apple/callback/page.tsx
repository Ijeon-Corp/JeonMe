"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, appleLogin, setToken } from "@/lib/api-client";
import { redirectAfterAuth } from "@/lib/auth-redirect";
import { appleRedirectUri, consumeAppleOAuthState } from "@/lib/apple-oauth";
import AuthShell from "@/components/AuthShell";

type CallbackResult = { ok: true; token: string } | { ok: false; message: string };

// resolveCallback -- fungsi pengambil-data MURNI (return hasil, TANPA
// setState) dipisah dari komponennya sendiri, pola SAMA PERSIS dengan
// app/auth/google/callback/page.tsx (react-hooks/set-state-in-effect,
// lihat CLAUDE.md).
async function resolveCallback(searchParams: URLSearchParams): Promise<CallbackResult> {
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return {
      ok: false,
      message: oauthError === "user_cancelled_authorize" ? "Kamu membatalkan proses masuk dengan Apple." : "Apple mengembalikan error, coba lagi.",
    };
  }

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const expectedState = consumeAppleOAuthState();
  if (!code || !returnedState || returnedState !== expectedState) {
    return { ok: false, message: "Sesi login Apple tidak valid atau kedaluwarsa, coba lagi dari awal." };
  }

  try {
    const res = await appleLogin({ code, redirect_uri: appleRedirectUri() });
    return { ok: true, token: res.token };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Gagal masuk dengan Apple, coba lagi." };
  }
}

// /auth/apple/callback -- URI ini didaftarkan PERSIS sebagai Return URL di
// Apple Developer (Services ID > Sign in with Apple > Configure), lihat
// catatan lengkap di apps/api/.env.example. Apple mengarahkan browser ke
// sini bawa ?code=... setelah pengguna menyetujui, baik dimulai dari
// tombol di /login MAUPUN /register (satu callback melayani keduanya,
// backend juga satu endpoint yang sama -- lihat AuthHandler.AppleLogin &
// AppleAuthButton.tsx). response_mode=query (bukan form_post) yang
// diminta lib/apple-oauth.ts membuat Apple redirect lewat GET query string
// sederhana, sama seperti Google -- makanya halaman ini bisa memakai pola
// baca window.location.search yang identik, tanpa perlu menangani POST form.
export default function AppleCallbackPage() {
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
      <h1 className="font-heading text-3xl font-extrabold text-ink">Menghubungkan ke Apple...</h1>
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
