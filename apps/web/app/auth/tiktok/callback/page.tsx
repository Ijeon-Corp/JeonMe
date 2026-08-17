"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, connectTikTok } from "@/lib/api-client";
import { consumeTikTokOAuthState, socialRedirectUri } from "@/lib/social-oauth";

type CallbackResult = { ok: true; username: string } | { ok: false; message: string };

async function resolveCallback(searchParams: URLSearchParams): Promise<CallbackResult> {
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return { ok: false, message: "Kamu membatalkan proses menyambungkan TikTok." };
  }

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const expectedState = consumeTikTokOAuthState();
  if (!code || !returnedState || returnedState !== expectedState) {
    return { ok: false, message: "Sesi koneksi TikTok tidak valid atau kedaluwarsa, coba lagi dari awal." };
  }

  try {
    const res = await connectTikTok({ code, redirect_uri: socialRedirectUri("tiktok") });
    return { ok: true, username: res.username };
  } catch (err) {
    return { ok: false, message: err instanceof ApiError ? err.message : "Gagal menyambungkan akun TikTok, coba lagi." };
  }
}

// /auth/tiktok/callback -- URI ini didaftarkan PERSIS sebagai redirect URI
// di TikTok Developer Portal (Login Kit). Lihat catatan lengkap di
// app/auth/instagram/callback/page.tsx -- pola identik.
export default function TikTokCallbackPage() {
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
        {!result ? "Menghubungkan ke TikTok..." : result.ok ? "TikTok tersambung!" : "Gagal menyambungkan"}
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
