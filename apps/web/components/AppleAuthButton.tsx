"use client";

import { buildAppleAuthUrl } from "@/lib/apple-oauth";

// Logo Apple -- path resmi dari Simple Icons (simpleicons.org, CC0 1.0,
// SAMA sumbernya dengan ikon sosmed di components/icons.tsx yang diganti
// 20 Agustus 2026) -- SENGAJA di sini, bukan ditambah ke icons.tsx/
// icon-library.ts, karena logo ini HANYA relevan sebagai bagian tombol
// "Sign in with Apple" itu sendiri (pedoman brand Apple: logo boleh
// dipakai KHUSUS pada tombol Sign in with Apple, bukan sebagai ikon
// tautan/pilihan bebas seperti galeri ikon biasa).
function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" fill="currentColor" aria-hidden>
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

// AppleAuthButton -- permintaan langsung pengguna, 20 Agustus 2026:
// "tambahkan juga login via apple". Struktur SENGAJA sedekat mungkin
// dengan GoogleAuthButton.tsx (props sama, pola soft-fail sama -- tidak
// dirender sama sekali kalau NEXT_PUBLIC_APPLE_CLIENT_ID belum diisi) --
// dipakai SATU komponen yang sama di /login DAN /register, backend juga
// satu endpoint yang sama (AuthHandler.AppleLogin) yang melayani login
// MAUPUN register sekaligus.
export default function AppleAuthButton({
  label,
  onBeforeRedirect,
}: {
  label: string;
  onBeforeRedirect?: () => boolean;
}) {
  const clientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;

  if (!clientId) return null;

  function handleClick() {
    if (onBeforeRedirect && !onBeforeRedirect()) return;
    window.location.href = buildAppleAuthUrl(clientId!);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-full border border-border bg-white px-5 py-3.5 text-sm font-bold text-ink shadow-sm transition-colors hover:bg-black/[0.02]"
    >
      <AppleLogo />
      {label}
    </button>
  );
}
