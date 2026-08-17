"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, connectInstagram } from "@/lib/api-client";
import { consumeInstagramOAuthState, socialRedirectUri } from "@/lib/social-oauth";

type CallbackResult = { ok: true; username: string } | { ok: false; message: string };

// resolveCallback -- fungsi pengambil-data MURNI (return hasil, TANPA
// setState), pola yang sama dengan app/auth/google/callback/page.tsx
// (react-hooks/set-state-in-effect, lihat CLAUDE.md).
async function resolveCallback(searchParams: URLSearchParams): Promise<CallbackResult> {
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return { ok: false, message: "Kamu membatalkan proses menyambungkan Instagram." };
  }

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const expectedState = consumeInstagramOAuthState();
  if (!code || !returnedState || returnedState !== expectedState) {
    return { ok: false, message: "Sesi koneksi Instagram tidak valid atau kedaluwarsa, coba lagi dari awal." };
  }

  try {
    const res = await connectInstagram({ code, redirect_uri: socialRedirectUri("instagram") });
    return { ok: true, username: res.username };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Gagal menyambungkan akun Instagram, coba lagi." };
  }
}

// /auth/instagram/callback -- URI ini didaftarkan PERSIS sebagai OAuth
// redirect URI di Meta App Dashboard (Modul Koneksi Sosial, migrasi
// 000069, permintaan langsung pengguna: "saya mau jeonme ini bisa connect
// ke akun kita contoh nya instagram tiktok"). BEDA dari
// /auth/google/callback (yang bisa membuat akun BARU) -- endpoint ini
// SELALU menyambungkan ke akun yang SUDAH login (dashboard, lihat
// SocialConnectHandler.ConnectInstagram), jadi redirect sukses kembali ke
// dashboard, bukan ke halaman utama aplikasi.
export default function InstagramCallbackPage() {
  const router = useRouter();
  const [result, setResult] = useState<CallbackResult | null>(null);

  useEffect(() => {
    resolveCallback(new URLSearchParams(window.location.search)).then(setResult);
  }, []);

  useEffect(() => {
    if (!result?.ok) return;
    const timer = setTimeout(() => router.push("/dashboard/social-connect"), 1500);
    return () => clearTimeout(timer);
  }, [result, router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-heading text-2xl font-extrabold text-ink">
        {!result ? "Menghubungkan ke Instagram..." : result.ok ? "Instagram tersambung!" : "Gagal menyambungkan"}
      </h1>
      {result && !result.ok && (
        <>
          <p className="mt-3 text-sm text-red-600">{result.message}</p>
          <Link href="/dashboard/social-connect" className="mt-6 text-sm font-semibold text-primary hover:underline">
            Kembali
          </Link>
        </>
      )}
      {result?.ok && <p className="mt-3 text-sm text-muted">Akun @{result.username} berhasil disambungkan. Mengalihkan...</p>}
    </div>
  );
}
