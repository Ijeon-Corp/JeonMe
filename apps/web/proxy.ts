import { NextRequest, NextResponse } from "next/server";

// No.81 (Sprint 9): domain kustom -- bagian APLIKASI saja (lihat catatan
// lingkup lengkap di CustomDomainHandler backend). Proxy ini menerjemahkan
// Host header yang BUKAN domain Jeonme sendiri ke username kreator lewat
// backend (hanya domain yang SUDAH terverifikasi lewat DNS yang di-resolve),
// lalu me-rewrite request secara internal ke /{username} -- pengunjung
// custom domain tetap melihat halaman kreator seolah-olah itu domain
// aslinya (URL address bar tidak berubah).
//
// BELUM ada wiring Apache/reverse-proxy produksi supaya Host header
// sembarang benar-benar sampai ke container ini, dan belum ada SSL
// otomatis per domain -- proxy ini baru bisa diuji nyata begitu ada
// domain uji sungguhan yang diarahkan ke server (dicatat sebagai
// pekerjaan lanjutan).
// jeon.id adalah domain kanonik sejak migrasi 18 Agustus 2026; jeonme.com
// TETAP terdaftar sebagai domain lama yang redirect 301 ke jeon.id (bukan
// didekomisi), jadi kedua host tetap perlu dikenali di sini.
const KNOWN_HOSTS = ["jeon.id", "staging.jeon.id", "jeonme.com", "staging.jeonme.com", "localhost", "127.0.0.1"];

function resolveApiBaseUrl(): string {
  return process.env.INTERNAL_API_BASE_URL ?? "http://localhost:8080/api/v1";
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0];

  const isKnownHost = KNOWN_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
  if (isKnownHost) {
    return NextResponse.next();
  }

  try {
    const res = await fetch(`${resolveApiBaseUrl()}/domains/${hostname}/resolve`, { cache: "no-store" });
    if (res.ok) {
      const data: { username?: string } = await res.json();
      if (data.username) {
        const url = request.nextUrl.clone();
        url.pathname = `/${data.username}`;
        return NextResponse.rewrite(url);
      }
    }
  } catch {
    // Backend tidak terjangkau -- biarkan request lanjut apa adanya
    // (bukan crash), akan berakhir 404 wajar kalau memang bukan domain
    // Jeonme yang dikenal.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
