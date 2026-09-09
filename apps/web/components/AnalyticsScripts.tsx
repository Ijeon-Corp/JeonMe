"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { getUtmParamsFromWindow, type PublicAnalytics } from "@/lib/api-client";
import { onCookieConsentChange, readCookieConsent } from "@/lib/cookie-consent";

// AnalyticsGlobals -- fbq/gtag dipasang sbg fungsi global oleh dua <Script>
// inline di bawah (BUKAN modul yang bisa di-import) -- tipe minimal ini
// menghindari `any` mentah saat membacanya balik dari `window`.
type AnalyticsGlobals = Window & {
  fbq?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
};

// waitForGlobal -- permintaan langsung pengguna 9 September 2026 ("utm
// yang ada korelasi nya dengan pixel"): fbq/gtag didefinisikan oleh
// <Script strategy="afterInteractive"> di bawah -- TIDAK ada jaminan
// urutan yang solid antara SAAT script itu selesai dieksekusi browser vs
// SAAT efek di komponen ini berjalan (keduanya "setelah interactive", tapi
// tidak dijamin siapa duluan). Polling pendek (maks ~3 detik) adalah pola
// pertahanan standar utk menunggu global pihak ketiga siap, dipakai di
// sini dari pada bergantung pada asumsi timing next/script yang tidak
// didokumentasikan secara eksplisit.
function waitForGlobal(check: () => boolean, run: () => void, attemptsLeft = 20) {
  if (check()) {
    run();
    return;
  }
  if (attemptsLeft <= 0) return;
  setTimeout(() => waitForGlobal(check, run, attemptsLeft - 1), 150);
}

// AnalyticsScripts -- Modul Analitik Pihak Ketiga (permintaan langsung
// pengguna, 12 Agustus 2026, referensi tangkapan layar panel "Analytics"
// Linktree): menyisipkan kode dasar Meta Pixel & Google gtag.js (GA4) ke
// HALAMAN PUBLIK kreator (bukan dashboard -- lihat catatan di
// PublicPageFrame.tsx soal kenapa ini dipasang di rute halaman publik,
// bukan di app/layout.tsx yang membungkus semua rute termasuk dashboard).
//
// fb_pixel_id/ga_measurement_id AMAN disisipkan langsung ke dalam
// <script> inline di sini -- backend (fbPixelIDPattern/
// gaMeasurementIDPattern, analytics_settings.go) MEWAJIBKAN formatnya
// ketat (Pixel ID numerik murni, Measurement ID "G-" + alfanumerik)
// SEBELUM tersimpan, supaya kolom ini tidak bisa disalahgunakan jadi
// celah XSS tersimpan. TIDAK ADA fb_access_token di sini -- itu SECRET,
// cuma dipakai server-side (lihat publicAnalytics, page.go).
//
// PERSETUJUAN COOKIE (3 September 2026, benchmark Linktree "Cookie
// Preferences"): skrip HANYA dimuat setelah pengunjung menyetujui
// kategorinya -- GA = "analytics", Meta Pixel = "marketing" (lihat
// lib/cookie-consent.ts & CookieConsent.tsx). Sebelum ada pilihan, tidak
// ada yang dimuat. Karena itu komponen ini jadi client component: ia
// membaca localStorage dan bereaksi saat pilihan berubah, tanpa reload.
export default function AnalyticsScripts({ analytics }: { analytics: PublicAnalytics | null }) {
  const [allowAnalytics, setAllowAnalytics] = useState(false);
  const [allowMarketing, setAllowMarketing] = useState(false);

  useEffect(() => {
    const apply = (c: { analytics: boolean; marketing: boolean } | null) => {
      setAllowAnalytics(!!c?.analytics);
      setAllowMarketing(!!c?.marketing);
    };
    apply(readCookieConsent());
    return onCookieConsentChange(apply);
  }, []);

  // Korelasi UTM <-> Pixel/GA (permintaan langsung pengguna 9 September
  // 2026): fbq('track','PageView') & gtag('config', ...) di bawah TETAP
  // dipertahankan APA ADANYA (nol risiko regresi ke pemasangan Pixel/GA
  // yang sudah berjalan di production) -- efek TAMBAHAN ini mengirim SATU
  // event lagi yang membawa konteks UTM MASUK (dari iklan/kampanye,
  // getUtmParamsFromWindow), supaya Meta Events Manager/GA4 bisa
  // mengaitkan kunjungan ini ke campaign asalnya. Sengaja TIDAK fire
  // sama sekali kalau tidak ada UTM (kunjungan organik) -- event ekstra
  // tanpa isi baru cuma noise. Nilai UTM diteruskan sbg ARGUMEN FUNGSI
  // ASLI ke fbq()/gtag() (bukan disisipkan ke string <Script> manapun) --
  // wajib begitu karena nilainya berasal LANGSUNG dari query string URL
  // pengunjung (tidak tervalidasi/tersanitasi sama sekali), menyisipkannya
  // mentah ke dalam teks <script> akan jadi celah XSS nyata.
  useEffect(() => {
    if (!analytics?.fb_pixel_id || !allowMarketing) return;
    const utm = getUtmParamsFromWindow();
    if (Object.keys(utm).length === 0) return;
    waitForGlobal(
      () => typeof (window as AnalyticsGlobals).fbq === "function",
      () => (window as AnalyticsGlobals).fbq?.("trackCustom", "PageViewUTM", utm)
    );
  }, [analytics?.fb_pixel_id, allowMarketing]);

  useEffect(() => {
    if (!analytics?.ga_measurement_id || !allowAnalytics) return;
    const utm = getUtmParamsFromWindow();
    if (Object.keys(utm).length === 0) return;
    waitForGlobal(
      () => typeof (window as AnalyticsGlobals).gtag === "function",
      () => {
        const gtag = (window as AnalyticsGlobals).gtag;
        gtag?.("set", "campaign", {
          source: utm.utm_source,
          medium: utm.utm_medium,
          name: utm.utm_campaign,
          content: utm.utm_content,
          term: utm.utm_term,
        });
        gtag?.("event", "utm_pageview", utm);
      }
    );
  }, [analytics?.ga_measurement_id, allowAnalytics]);

  if (!analytics) return null;

  return (
    <>
      {analytics.fb_pixel_id && allowMarketing && (
        <Script id="meta-pixel-base" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${analytics.fb_pixel_id}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}
      {analytics.ga_measurement_id && allowAnalytics && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${analytics.ga_measurement_id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${analytics.ga_measurement_id}');
            `}
          </Script>
        </>
      )}
    </>
  );
}
